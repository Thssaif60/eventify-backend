import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";
import { ensureSystemAccounts } from "../accounting/systemAccounts.js";
import { postJournal } from "../accounting/posting.js";

const CustomerLine = z.object({ customerId: z.string().uuid(), openingAR: z.coerce.number().nonnegative().default(0) });
const VendorLine = z.object({ vendorId: z.string().uuid(), openingAP: z.coerce.number().nonnegative().default(0) });
const CashLine = z.object({ accountId: z.string().uuid(), openingBalance: z.coerce.number().default(0) }); // can be bank/cash accounts
const ItemLine = z.object({ itemId: z.string().uuid(), qty: z.coerce.number().nonnegative(), unitCost: z.coerce.number().nonnegative().default(0) });

const Payload = z.object({
  asOf: z.string().datetime().optional().nullable(),
  customers: z.array(CustomerLine).optional().default([]),
  vendors: z.array(VendorLine).optional().default([]),
  cash: z.array(CashLine).optional().default([]),
  inventory: z.array(ItemLine).optional().default([]),
  force: z.boolean().optional().default(false)
});

function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

export async function preview(businessId: string, input: unknown) {
  const data = Payload.parse(input);
  const asOf = data.asOf ? new Date(data.asOf) : new Date();

  // Simple computed totals
  const ar = round2(data.customers.reduce((s, c) => s + Number(c.openingAR || 0), 0));
  const ap = round2(data.vendors.reduce((s, v) => s + Number(v.openingAP || 0), 0));
  const cash = round2(data.cash.reduce((s, a) => s + Number(a.openingBalance || 0), 0));
  const inv = round2(data.inventory.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitCost || 0), 0));

  // Equity plug: Assets - Liabilities (AR + Cash + Inv) - AP
  const equity = round2((ar + cash + inv) - ap);

  return {
    asOf,
    totals: { ar, ap, cash, inventoryValue: inv, openingEquity: equity }
  };
}

export async function apply(businessId: string, userId: string, input: unknown) {
  const data = Payload.parse(input);
  const asOf = data.asOf ? new Date(data.asOf) : new Date();

  return prisma.$transaction(async (tx) => {
    const settings = await tx.businessSettings.upsert({ where: { businessId }, update: {}, create: { businessId } });
    if (settings.openingSetOnce && !data.force) throw new HttpError(409, "Opening balances already set. Use force=true only if you know what you're doing.");

    const accts = await ensureSystemAccounts(businessId, tx);

    // Validate all referenced ids exist
    const customerIds = [...new Set(data.customers.map(x => x.customerId))];
    const vendorIds = [...new Set(data.vendors.map(x => x.vendorId))];
    const itemIds = [...new Set(data.inventory.map(x => x.itemId))];

    if (customerIds.length) {
      const count = await tx.customer.count({ where: { businessId, id: { in: customerIds } } });
      if (count !== customerIds.length) throw new HttpError(400, "One or more customers not found");
    }
    if (vendorIds.length) {
      const count = await tx.vendor.count({ where: { businessId, id: { in: vendorIds } } });
      if (count !== vendorIds.length) throw new HttpError(400, "One or more vendors not found");
    }
    if (itemIds.length) {
      const count = await tx.item.count({ where: { businessId, id: { in: itemIds } } });
      if (count !== itemIds.length) throw new HttpError(400, "One or more items not found");
    }

    // Build journal lines
    const lines: any[] = [];

    // AR opening: DR AR / CR Opening Equity
    const ar = round2(data.customers.reduce((s, c) => s + Number(c.openingAR || 0), 0));
    if (ar > 0) lines.push({ accountId: accts.AR.id, debit: ar, memo: "Opening AR" });

    // Cash/bank opening: DR selected cash/bank accounts / CR Opening Equity
    for (const c of data.cash) {
      const amt = round2(Number(c.openingBalance || 0));
      if (!amt) continue;
      lines.push({ accountId: c.accountId, debit: amt, memo: "Opening Cash/Bank" });
    }

    // Inventory opening: DR Inventory / CR Opening Equity
    const invValue = round2(data.inventory.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitCost || 0), 0));
    if (invValue > 0) lines.push({ accountId: accts.INVENTORY.id, debit: invValue, memo: "Opening Inventory" });

    // AP opening: CR AP / DR Opening Equity
    const ap = round2(data.vendors.reduce((s, v) => s + Number(v.openingAP || 0), 0));
    if (ap > 0) lines.push({ accountId: accts.AP.id, credit: ap, memo: "Opening AP" });

    // Equity balancing line
    const debit = lines.reduce((s,l)=> s + Number(l.debit||0),0);
    const credit = lines.reduce((s,l)=> s + Number(l.credit||0),0);
    const diff = round2(debit - credit); // if positive, need credit to balance
    if (diff > 0) lines.push({ accountId: accts.OPENING_EQUITY.id, credit: diff, memo: "Opening Balance Equity" });
    if (diff < 0) lines.push({ accountId: accts.OPENING_EQUITY.id, debit: Math.abs(diff), memo: "Opening Balance Equity" });

    const journal = await postJournal({
      businessId,
      refType: "OPENING",
      refId: businessId,
      postedOn: asOf,
      memo: "Opening balances",
      lines
    }, tx);

    // Apply customer/vendor opening remaining + totals
    for (const c of data.customers) {
      const amt = round2(Number(c.openingAR||0));
      await tx.customer.update({ where: { id: c.customerId }, data: { openingAR: amt as any, openingARRemaining: amt as any } });
    }
    for (const v of data.vendors) {
      const amt = round2(Number(v.openingAP||0));
      await tx.vendor.update({ where: { id: v.vendorId }, data: { openingAP: amt as any, openingAPRemaining: amt as any } });
    }

    // Inventory lots + onHand + avgCost
    const costing = (settings.inventoryCosting || "FIFO") as "FIFO" | "AVG";
    if (data.inventory.length) {
      // create an inventory move (OPENING) for audit
      const move = await tx.inventoryMove.create({
        data: {
          businessId,
          type: "OPENING" as any,
          movedOn: asOf,
          memo: "Opening inventory",
          postedJournalId: journal.id,
          lines: { create: data.inventory.map(l => ({ itemId: l.itemId, qty: l.qty as any, unitCost: l.unitCost as any, totalCost: round2(l.qty*l.unitCost) as any })) }
        },
        include: { lines: true }
      });

      for (const l of move.lines) {
        const qty = Number(l.qty||0);
        const unitCost = Number(l.unitCost||0);

        // onHand update
        const item = await tx.item.findFirst({ where: { businessId, id: l.itemId } });
        if (!item) continue;

        await tx.item.update({
          where: { id: item.id },
          data: {
            onHand: (Number(item.onHand||0) + qty) as any,
            avgCost: (costing === "AVG"
              ? (Number(item.onHand||0) + qty > 0
                ? ((Number(item.onHand||0)*Number(item.avgCost||0) + qty*unitCost) / (Number(item.onHand||0) + qty))
                : unitCost)
              : Number(item.avgCost||0)) as any
          }
        });

        // FIFO lots
        await tx.inventoryLot.create({
          data: {
            businessId,
            itemId: item.id,
            receivedOn: asOf,
            sourceType: "OPENING",
            sourceId: move.id,
            qtyIn: qty as any,
            qtyRemaining: qty as any,
            unitCost: unitCost as any
          }
        });
      }
    }

    await tx.businessSettings.update({ where: { businessId }, data: { openingSetOnce: true } });

    await tx.auditLog.create({
      data: { businessId, userId, action: "APPLY", entity: "OpeningBalances", entityId: journal.id, meta: { postedOn: asOf } as any }
    });

    return { ok: true, journalId: journal.id };
  });
}
