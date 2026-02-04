import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";
import { ensureSystemAccounts } from "../accounting/systemAccounts.js";
import { postJournal } from "../accounting/posting.js";
import { resolveFxRate } from "../../utils/currency.js";

const ItemSchema = z.object({
  itemId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(200),
  qty: z.coerce.number().positive().default(1),
  unitPrice: z.coerce.number().nonnegative().default(0),
  taxRate: z.coerce.number().nonnegative().default(0)
});

const CreateSchema = z.object({
  vendorId: z.string().uuid().optional().nullable(),
  vendorName: z.string().min(1).max(200),
  billedOn: z.string().datetime().optional().nullable(),
  dueOn: z.string().datetime().optional().nullable(),
  currency: z.string().min(0).max(10).optional().nullable(),
  fxRate: z.coerce.number().positive().optional().default(1),
  items: z.array(ItemSchema).min(1),
  notes: z.string().optional().nullable()
});

const UpdateSchema = CreateSchema.partial();

function round(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}


async function resolveFx(businessId: string, quote: string, base: string) {
  const rate = await resolveFxRate(businessId, quote, base);
  return Number(rate || 1);
}

function calc(items: Array<z.infer<typeof ItemSchema>>) {
  const lines = items.map(i => {
    const line = i.qty * i.unitPrice;
    const tax = line * i.taxRate;
    return { ...i, lineTotal: round(line + tax) };
  });
  const total = round(lines.reduce((s, l) => s + l.lineTotal, 0));
  return { lines, total };
}

async function getBusinessBaseCurrency(businessId: string) {
  const s = await prisma.businessSettings.findUnique({ where: { businessId } });
  return (s?.baseCurrency || "USD").toUpperCase();
}

export async function list(businessId: string, query: any) {
  const status = (query?.status as string | undefined)?.trim();
  const q = (query?.q as string | undefined)?.trim();
  const items = await prisma.bill.findMany({
    where: {
      businessId,
      ...(status ? { status: status as any } : {}),
      ...(q ? { OR: [{ billNo: { contains: q, mode: "insensitive" } }, { vendorName: { contains: q, mode: "insensitive" } }] } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return { items };
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
  const fxRate = data.fxRate ? Number(data.fxRate) : await resolveFx(businessId, currency, baseCurrency);

  const { lines, total } = calc(data.items);

  const billedOn = data.billedOn ? new Date(data.billedOn) : new Date();
  const dueOn = data.dueOn ? new Date(data.dueOn) : null;

  const created = await prisma.$transaction(async (tx) => {
    const nextNo = settings.billNextNo || 1;
    const prefix = settings.billPrefix || "BILL-";
    const billNo = `${prefix}${String(nextNo).padStart(6, "0")}`;

    await tx.businessSettings.update({
      where: { businessId },
      data: { billNextNo: nextNo + 1 }
    });

    const bill = await tx.bill.create({
      data: {
        businessId,
        billNo,
        vendorId: data.vendorId ?? undefined,
        vendorName: data.vendorName,
        status: "DRAFT",
        billedOn,
        dueOn: dueOn ?? undefined,
        currency,
        fxRate,
        amount: total as any,
        balance: total as any,
        amountBase: round(total * fxRate) as any,
        notes: data.notes ?? undefined,
        items: {
          create: lines.map(l => ({
            name: l.name,
            qty: l.qty as any,
            unitPrice: l.unitPrice as any,
            taxRate: l.taxRate as any,
            lineTotal: l.lineTotal as any,
            itemId: (l as any).itemId ?? undefined
          }))
        }
      },
      include: { items: true }
    });

    await tx.auditLog.create({
      data: { businessId, userId, action: "CREATE", entity: "Bill", entityId: bill.id, meta: bill as any }
    });

    return bill;
  });

  return created;
}

export async function get(businessId: string, id: string) {
  const item = await prisma.bill.findFirst({
    where: { businessId, id },
    include: { items: true, payments: true }
  });
  if (!item) throw new HttpError(404, "Bill not found");
  return item;
}

export async function update(businessId: string, userId: string, id: string, input: unknown) {
  const data = UpdateSchema.parse(input);
  const existing = await get(businessId, id);
  if (existing.status !== "DRAFT") throw new HttpError(409, "Only DRAFT bills can be edited");

  const baseCurrency = await getBusinessBaseCurrency(businessId);
  const currency = (data.currency || existing.currency || baseCurrency).toUpperCase();
  const fxRate = Number(data.fxRate ?? existing.fxRate);

  const items = data.items ? data.items : existing.items.map(i => ({ name: i.name, qty: Number(i.qty), unitPrice: Number(i.unitPrice), taxRate: Number(i.taxRate) }));
  const { lines, total } = calc(items);

  const updated = await prisma.bill.update({
    where: { id },
    data: {
      vendorId: data.vendorId ?? existing.vendorId ?? undefined,
      vendorName: data.vendorName ?? existing.vendorName,
      billedOn: data.billedOn ? new Date(data.billedOn) : existing.billedOn,
      dueOn: data.dueOn ? new Date(data.dueOn) : existing.dueOn ?? undefined,
      currency,
      fxRate,
      amount: total as any,
      balance: total as any,
      amountBase: round(total * fxRate) as any,
      notes: data.notes ?? existing.notes ?? undefined,
      items: {
        deleteMany: {},
        create: lines.map(l => ({
          name: l.name,
          qty: l.qty as any,
          unitPrice: l.unitPrice as any,
          taxRate: l.taxRate as any,
          lineTotal: l.lineTotal as any,
            itemId: (l as any).itemId ?? undefined
        }))
      }
    },
    include: { items: true }
  });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "UPDATE", entity: "Bill", entityId: id, meta: { before: existing, after: updated } }
  });

  return updated;
}

export async function approve(businessId: string, userId: string, id: string) {
  const bill = await prisma.bill.findFirst({ where: { businessId, id }, include: { items: true } });
  if (!bill) throw new HttpError(404, "Bill not found");
  if (bill.status !== "DRAFT") throw new HttpError(409, "Bill already processed");

  // recompute totals from items (split inventory vs expense)
  let expenseSubtotal = 0;
  let inventorySubtotal = 0;
  let tax = 0;

  // Fetch referenced items (if any)
  const itemIds = [...new Set(bill.items.map(i => i.itemId).filter(Boolean) as string[])];
  const invItems = itemIds.length
    ? await prisma.item.findMany({ where: { businessId, id: { in: itemIds } } })
    : [];
  const itemMap = new Map(invItems.map(i => [i.id, i]));

  for (const it of bill.items) {
    const base = Number(it.qty) * Number(it.unitPrice);
    const t = base * Number(it.taxRate);
    tax += t;

    const maybeItemId = (it as any).itemId as string | null | undefined;
    if (maybeItemId) {
      const item = itemMap.get(maybeItemId);
      if (!item) throw new HttpError(400, "One or more bill items reference an unknown inventory item");
      if (item.type !== "PRODUCT") {
        // Services never hit Inventory
        expenseSubtotal += base;
      } else {
        inventorySubtotal += base;
      }
    } else {
      expenseSubtotal += base;
    }
  }

  expenseSubtotal = round(expenseSubtotal);
  inventorySubtotal = round(inventorySubtotal);
  tax = round(tax);

  const subtotal = round(expenseSubtotal + inventorySubtotal);
  const total = round(subtotal + tax);

  const fxRate = Number(bill.fxRate || 1);
  const totalBase = round(total * fxRate);
  const expenseBase = round(expenseSubtotal * fxRate);
  const inventoryBase = round(inventorySubtotal * fxRate);
  const taxBase = round(tax * fxRate);

  const postedOn = bill.billedOn ? new Date(bill.billedOn) : new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const accts = await ensureSystemAccounts(businessId, tx);

    // Post journal: DR Inventory (if any) + DR Expense (if any) + DR Input VAT + CR AP
    const lines: any[] = [];
    if (inventoryBase > 0) lines.push({ accountId: accts.INVENTORY.id, debit: inventoryBase, memo: "Inventory purchases (net)" });
    if (expenseBase > 0) lines.push({ accountId: accts.EXPENSE.id, debit: expenseBase, memo: "Expenses (net)" });
    if (taxBase > 0) lines.push({ accountId: accts.TAX_INPUT.id, debit: taxBase, memo: "Input VAT" });
    lines.push({ accountId: accts.AP.id, credit: totalBase, memo: `AP ${bill.vendorName}` });

    const journal = await postJournal({
      businessId,
      refType: "BILL",
      refId: bill.id,
      postedOn,
      memo: `Bill ${bill.billNo}`,
      lines
    }, tx);

    // If bill contains inventory items, create an inventory move (PURCHASE) and lots (FIFO) and update onHand/avgCost (AVG)
    if (inventorySubtotal > 0) {
      const settings = await tx.businessSettings.upsert({ where: { businessId }, update: {}, create: { businessId } });
      const costing = (settings.inventoryCosting || "FIFO") as "FIFO" | "AVG";

      // Build purchase move lines for product items only
      const purchaseLines = bill.items
        .filter(i => (i as any).itemId)
        .map(i => ({ billItem: i, item: itemMap.get((i as any).itemId as string) }))
        .filter(x => x.item && x.item.type === "PRODUCT") as any[];

      if (purchaseLines.length) {
        const move = await tx.inventoryMove.create({
          data: {
            businessId,
            type: "PURCHASE" as any,
            movedOn: postedOn,
            memo: `From Bill ${bill.billNo}`,
            postedJournalId: journal.id,
            lines: {
              create: purchaseLines.map(x => {
                const qty = Number(x.billItem.qty || 0);
                const unit = Number(x.billItem.unitPrice || 0) * fxRate; // store base currency cost for internal costing
                const totalCost = round(qty * unit);
                return { itemId: x.item.id, qty: qty as any, unitCost: unit as any, totalCost: totalCost as any };
              })
            }
          },
          include: { lines: true }
        });

        for (const line of move.lines) {
          const qty = Number(line.qty || 0);
          const unitCost = Number(line.unitCost || 0);

          const item = await tx.item.findFirst({ where: { businessId, id: line.itemId } });
          if (!item) continue;

          // AVG cost update
          if (costing === "AVG") {
            const oldQty = Number(item.onHand || 0);
            const oldAvg = Number(item.avgCost || 0);
            const newQty = oldQty + qty;
            const newAvg = newQty > 0 ? ((oldQty * oldAvg + qty * unitCost) / newQty) : unitCost;

            await tx.item.update({
              where: { id: item.id },
              data: {
                onHand: newQty as any,
                avgCost: newAvg as any
              }
            });
          } else {
            await tx.item.update({
              where: { id: item.id },
              data: { onHand: (Number(item.onHand || 0) + qty) as any }
            });
          }

          // FIFO lot layer
          await tx.inventoryLot.create({
            data: {
              businessId,
              itemId: item.id,
              receivedOn: postedOn,
              sourceType: "BILL",
              sourceId: bill.id,
              qtyIn: qty as any,
              qtyRemaining: qty as any,
              unitCost: unitCost as any
            }
          });
        }
      }
    }

    const b = await tx.bill.update({
      where: { id: bill.id },
      data: {
        status: "APPROVED",
        amount: total as any,
        balance: total as any,
        amountBase: totalBase as any,
        postedJournalId: journal.id
      }
    });

    await tx.auditLog.create({
      data: { businessId, userId, action: "APPROVE", entity: "Bill", entityId: bill.id, meta: b as any }
    });

    return b;
  });

  return updated;
}
