import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";
import { resolveFxRate } from "../../utils/currency.js";
import { ensureSystemAccounts } from "../accounting/systemAccounts.js";
import { postJournal } from "../accounting/posting.js";

const ItemSchema = z.object({
  itemId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(200),
  qty: z.coerce.number().positive().default(1),
  unitPrice: z.coerce.number().nonnegative().default(0),
  taxRate: z.coerce.number().nonnegative().default(0) // 0.15 = 15%
});

const CreateSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(1).max(200),
  issuedOn: z.string().datetime().optional().nullable(),
  dueOn: z.string().datetime().optional().nullable(),
  currency: z.string().min(0).max(10).optional().nullable(),
  fxRate: z.coerce.number().positive().optional().default(1),
  items: z.array(ItemSchema).min(1),
  notes: z.string().optional().nullable()
});

const UpdateSchema = CreateSchema.partial().extend({
  status: z.any().optional()
});

function round(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function calc(items: Array<z.infer<typeof ItemSchema>>) {
  let subtotal = 0;
  let tax = 0;
  const lines = items.map(i => {
    const base = i.qty * i.unitPrice;
    const t = base * i.taxRate;
    subtotal += base;
    tax += t;
    return { ...i, lineTotal: round(base + t), lineBase: round(base), lineTax: round(t) };
  });
  subtotal = round(subtotal);
  tax = round(tax);
  const total = round(subtotal + tax);
  return { lines, subtotal, tax, total };
}

async function resolveFx(businessId: string, quote: string, base: string) {
  const rate = await resolveFxRate(businessId, quote, base);
  return Number(rate || 1);
}

export async function list(businessId: string, query: any) {
  const status = (query?.status as string | undefined)?.trim();
  const q = (query?.q as string | undefined)?.trim();

  const items = await prisma.invoice.findMany({
    where: {
      businessId,
      ...(status ? { status: status as any } : {}),
      ...(q
        ? {
            OR: [
              { invoiceNo: { contains: q, mode: "insensitive" } },
              { customerName: { contains: q, mode: "insensitive" } }
            ]
          }
        : {})
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  return { items };
}

export async function get(businessId: string, id: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { businessId, id },
    include: { items: true, customer: true, payments: true }
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");
  return invoice;
}

export async function create(businessId: string, userId: string, input: unknown) {
  const data = CreateSchema.parse(input);

  const settings = await prisma.businessSettings.upsert({
    where: { businessId },
    update: {},
    create: { businessId }
  });

  const baseCurrency = (settings.baseCurrency || "USD").toUpperCase();
  const currency = (data.currency || baseCurrency).toUpperCase();

  const issuedOn = data.issuedOn ? new Date(data.issuedOn) : new Date();
  const dueOn = data.dueOn ? new Date(data.dueOn) : undefined;

  // If caller didn't provide fxRate, resolve from latest CurrencyRate (quote->base)
  const fxRate = data.fxRate ? Number(data.fxRate) : await resolveFx(businessId, currency, baseCurrency);

  const { lines, subtotal, tax, total } = calc(data.items);
  const amountBase = round(total * fxRate);

  const created = await prisma.$transaction(async (tx) => {
    const nextNo = Number(settings.invoiceNextNo || 1);
    const prefix = settings.invoicePrefix || "INV-";
    const invoiceNo = `${prefix}${String(nextNo).padStart(6, "0")}`;

    await tx.businessSettings.update({
      where: { businessId },
      data: { invoiceNextNo: nextNo + 1 }
    });

    const inv = await tx.invoice.create({
      data: {
        businessId,
        invoiceNo,
        customerId: data.customerId ?? undefined,
        customerName: data.customerName,
        issuedOn,
        dueOn,
        currency,
        fxRate: fxRate as any,
        amount: total as any,
        balance: total as any,
        amountBase: amountBase as any,
        notes: data.notes ?? undefined,
        items: {
          create: lines.map(l => ({
            itemId: (l as any).itemId ?? undefined,
            name: l.name,
            qty: l.qty as any,
            unitPrice: l.unitPrice as any,
            taxRate: l.taxRate as any,
            lineTotal: l.lineTotal as any
          }))
        }
      }
    });

    return inv;
  });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "CREATE", entity: "Invoice", entityId: created.id, meta: created as any }
  });

  return created;
}

export async function update(businessId: string, userId: string, id: string, input: unknown) {
  const data = UpdateSchema.parse(input);
  const existing = await prisma.invoice.findFirst({ where: { businessId, id }, include: { items: true } });
  if (!existing) throw new HttpError(404, "Invoice not found");
  if (existing.status !== "DRAFT") throw new HttpError(409, "Only DRAFT invoices can be edited");

  const patch: any = {};

  if (data.customerId !== undefined) patch.customerId = data.customerId ?? null;
  if (data.customerName !== undefined) patch.customerName = data.customerName;
  if (data.issuedOn !== undefined) patch.issuedOn = data.issuedOn ? new Date(data.issuedOn) : null;
  if (data.dueOn !== undefined) patch.dueOn = data.dueOn ? new Date(data.dueOn) : null;
  if (data.notes !== undefined) patch.notes = data.notes ?? null;

  if (data.currency !== undefined) patch.currency = (data.currency || existing.currency || "").toUpperCase();
  if (data.fxRate !== undefined) patch.fxRate = Number(data.fxRate || existing.fxRate || 1);

  let newTotal = Number(existing.amount);
  let newBalance = Number(existing.balance);
  let newAmountBase = Number(existing.amountBase);

  if (data.items) {
    const { lines, total } = calc(data.items);
    newTotal = total;
    newBalance = total; // editing draft resets balance
    newAmountBase = round(total * Number(patch.fxRate ?? existing.fxRate));

    patch.amount = newTotal as any;
    patch.balance = newBalance as any;
    patch.amountBase = newAmountBase as any;

    patch.items = {
      deleteMany: { invoiceId: id },
      create: lines.map(l => ({
        itemId: (l as any).itemId ?? undefined,
        name: l.name,
        qty: l.qty as any,
        unitPrice: l.unitPrice as any,
        taxRate: l.taxRate as any,
        lineTotal: l.lineTotal as any
      }))
    };
  }

  const updated = await prisma.invoice.update({ where: { id }, data: patch });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "UPDATE", entity: "Invoice", entityId: id, meta: updated as any }
  });

  return updated;
}

export async function approve(businessId: string, userId: string, id: string) {
  const invoice = await prisma.invoice.findFirst({ where: { businessId, id }, include: { items: true } });
  if (!invoice) throw new HttpError(404, "Invoice not found");
  if (invoice.status !== "DRAFT") throw new HttpError(409, "Invoice already processed");

  // compute subtotal/tax from stored items to avoid drift
  let subtotal = 0;
  let tax = 0;
  for (const it of invoice.items) {
    const base = Number(it.qty) * Number(it.unitPrice);
    const t = base * Number(it.taxRate);
    subtotal += base;
    tax += t;
  }
  subtotal = round(subtotal);
  tax = round(tax);
  const total = round(subtotal + tax);

  const settings = await prisma.businessSettings.upsert({ where: { businessId }, update: {}, create: { businessId } });
  const baseCurrency = (settings.baseCurrency || "USD").toUpperCase();
  const fxRate = Number(invoice.fxRate || 1);
  const totalBase = round(total * fxRate);
  const subtotalBase = round(subtotal * fxRate);
  const taxBase = round(tax * fxRate);

  const postedOn = invoice.issuedOn ? new Date(invoice.issuedOn) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    const accts = await ensureSystemAccounts(businessId, tx);

    const journal = await postJournal({
      businessId,
      refType: "INVOICE",
      refId: invoice.id,
      postedOn,
      memo: `Invoice ${invoice.invoiceNo}`,
      lines: [
        { accountId: accts.AR.id, debit: totalBase, memo: `AR ${invoice.customerName}` },
        { accountId: accts.REVENUE.id, credit: subtotalBase, memo: "Revenue" },
        ...(taxBase > 0 ? [{ accountId: accts.TAX_PAYABLE.id, credit: taxBase, memo: "Tax payable" }] : [])
      ]
    }, tx);

    // Inventory deduction + COGS posting (FIFO/AVG) for PRODUCT items linked by itemId
    let inventoryMoveId: string | undefined;
    const saleLines = invoice.items
      .filter((it: any) => it.itemId)
      .map((it: any) => ({ itemId: it.itemId as string, qty: Number(it.qty) }));

    if (saleLines.length > 0) {
      // validate items exist and are PRODUCT
      const itemIds = [...new Set(saleLines.map(l => l.itemId))];
      const items = await tx.item.findMany({ where: { businessId, id: { in: itemIds } } });
      if (items.length !== itemIds.length) throw new HttpError(400, "One or more invoice items not found in Items");
      const productIds = new Set(items.filter(i => i.type === "PRODUCT").map(i => i.id));
      const filtered = saleLines.filter(l => productIds.has(l.itemId));

      if (filtered.length > 0) {
        // aggregate qty per item
        const agg = new Map<string, number>();
        for (const l of filtered) agg.set(l.itemId, (agg.get(l.itemId) || 0) + l.qty);
        const lines = [...agg.entries()].map(([itemId, qty]) => ({ itemId, qty }));

        // Create an inventory move of type SALE (treated like CONSUMPTION) and let inventory module compute FIFO/AVG costs.
        const move = await tx.inventoryMove.create({
          data: {
            businessId,
            type: "SALE" as any,
            movedOn: postedOn,
            memo: `Sale for Invoice ${invoice.invoiceNo}`,
            lines: {
              create: lines.map(l => ({ itemId: l.itemId, qty: l.qty as any, unitCost: 0 as any, totalCost: 0 as any }))
            }
          },
          include: { lines: true }
        });

        // Reuse inventory service costing + journal logic by inlining minimal SALE handling here
        const costing = ((settings.inventoryCosting || "FIFO") as any) as "FIFO" | "AVG";

        const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;
        let totalCogs = 0;

        // build quick item map
        const itemMap = new Map(items.map(i => [i.id, i] as const));

        for (const line of move.lines) {
          const item = itemMap.get(line.itemId);
          if (!item) continue;
          const qty = Number(line.qty || 0);

          const currentOnHand = Number(item.onHand || 0);
          if (currentOnHand < qty - 1e-9) throw new HttpError(409, `Insufficient stock for item ${item.name}`);

          if (costing === "AVG") {
            const unitCost = Number(item.avgCost || 0);
            if (unitCost <= 0) throw new HttpError(409, `Average cost not set for item ${item.name}. Receive stock first.`);
            const cost = round(qty * unitCost);

            await tx.item.update({ where: { id: item.id }, data: { onHand: { decrement: qty as any } } });
            itemMap.set(item.id, { ...(item as any), onHand: (currentOnHand - qty) as any });

            await tx.inventoryMoveLine.update({ where: { id: line.id }, data: { unitCost: unitCost as any, totalCost: cost as any } });
            totalCogs += cost;
          } else {
            // FIFO allocate from lots
            let remaining = qty;
            let lineCost = 0;

            const lots = await tx.inventoryLot.findMany({
              where: { businessId, itemId: item.id, qtyRemaining: { gt: 0 } },
              orderBy: [{ receivedOn: "asc" }, { createdAt: "asc" }]
            });

            for (const lot of lots) {
              if (remaining <= 0) break;
              const avail = Number(lot.qtyRemaining || 0);
              if (avail <= 0) continue;
              const take = Math.min(remaining, avail);
              const unitCost = Number(lot.unitCost || 0);
              const cost = round(take * unitCost);

              await tx.inventoryLot.update({ where: { id: lot.id }, data: { qtyRemaining: { decrement: take as any } } });
              await tx.inventoryLotAllocation.create({
                data: {
                  businessId,
                  lotId: lot.id,
                  moveLineId: line.id,
                  qty: take as any,
                  unitCost: unitCost as any,
                  cost: cost as any
                }
              });

              lineCost += cost;
              remaining -= take;
            }

            if (remaining > 1e-9) throw new HttpError(409, `Insufficient FIFO lots for item ${item.name}`);
            const effUnit = qty > 0 ? round6(lineCost / qty) : 0;

            await tx.item.update({ where: { id: item.id }, data: { onHand: { decrement: qty as any } } });
            itemMap.set(item.id, { ...(item as any), onHand: (currentOnHand - qty) as any });

            await tx.inventoryMoveLine.update({ where: { id: line.id }, data: { unitCost: effUnit as any, totalCost: round(lineCost) as any } });
            totalCogs += round(lineCost);
          }
        }

        if (totalCogs > 0) {
          const j = await postJournal({
            businessId,
            refType: "INVENTORY_MOVE",
            refId: move.id,
            postedOn,
            memo: `COGS for Invoice ${invoice.invoiceNo}`,
            lines: [
              { accountId: accts.COGS.id, debit: totalCogs, memo: "COGS" },
              { accountId: accts.INVENTORY.id, credit: totalCogs, memo: "Inventory out" }
            ]
          }, tx);
          await tx.inventoryMove.update({ where: { id: move.id }, data: { postedJournalId: j.id } });
        }

        inventoryMoveId = move.id;
      }
    }

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "APPROVED",
        amount: total as any,
        balance: total as any,
        amountBase: totalBase as any,
        postedJournalId: journal.id,
        inventoryMoveId: inventoryMoveId ?? undefined
      }
    });

    await tx.auditLog.create({
      data: { businessId, userId, action: "APPROVE", entity: "Invoice", entityId: invoice.id, meta: updated as any }
    });

    return updated;
  });

  return result;
}
