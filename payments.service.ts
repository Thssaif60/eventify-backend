import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";
import { ensureSystemAccounts } from "../accounting/systemAccounts.js";
import { postJournal } from "../accounting/posting.js";


async function nextReceiptNo(tx: any, businessId: string) {
  const settings = await tx.businessSettings.upsert({
    where: { businessId },
    update: {},
    create: { businessId }
  });

  const prefix = settings.receiptPrefix || "RCT-";
  const nextNo = Number(settings.receiptNextNo || 1);
  const receiptNo = `${prefix}${String(nextNo).padStart(6,"0")}`;

  await tx.businessSettings.update({
    where: { businessId },
    data: { receiptNextNo: nextNo + 1 }
  });

  return receiptNo;
}

const CreateSchema = z.object({
  direction: z.enum(["AR", "AP"]).default("AR"),
  refType: z.enum(["INVOICE", "BILL"]).default("INVOICE"),
  refId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  paidOn: z.string().datetime().optional().nullable(),
  method: z.string().optional().nullable(),
  cashAccountId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  currency: z.string().min(0).max(10).optional().nullable(),
  fxRate: z.coerce.number().positive().optional().default(1)
});

export async function list(businessId: string, query: any) {
  const q = (query?.q as string | undefined)?.trim();
  const items = await prisma.payment.findMany({
    where: {
      businessId,
      ...(q ? { counterpartyName: { contains: q, mode: "insensitive" } } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { invoice: true, bill: true }
  });
  return { items };
}

export async function create(businessId: string, userId: string, input: unknown) {
  const data = CreateSchema.parse(input);

  const amount = Number(data.amount);
  const fxRate = Number(data.fxRate || 1);
  const amountBase = round(amount * fxRate);

  const paidOn = data.paidOn ? new Date(data.paidOn) : new Date();

  const accts = await ensureSystemAccounts(businessId, tx);
  const currency = (data.currency || "").toUpperCase();

  if (data.refType === "INVOICE") {
    const invoice = await prisma.invoice.findFirst({ where: { businessId, id: data.refId } });
    if (!invoice) throw new HttpError(404, "Invoice not found");

    const newBalance = Math.max(0, round(Number(invoice.balance) - amount));
    const newStatus =
      newBalance === 0 ? "PAID" : (Number(invoice.amount) === newBalance ? invoice.status : "PARTIALLY_PAID");

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          businessId,
          direction: "AR",
          invoiceId: invoice.id,
          counterpartyId: invoice.customerId ?? undefined,
          counterpartyName: invoice.customerName,
          receiptNo: await nextReceiptNo(tx, businessId),
          amount: amount as any,
          paidOn,
          method: data.method ?? undefined,
        cashAccountId: data.cashAccountId ?? undefined,
          notes: data.notes ?? undefined,
          currency: currency || invoice.currency,
          fxRate: fxRate as any,
          amountBase: amountBase as any,
          fxGainLossBase: 0 as any
        }
      });

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { balance: newBalance as any, status: newStatus as any }
      });

      const j = await postJournal({
        businessId,
        refType: "PAYMENT",
        refId: p.id,
        postedOn: paidOn,
        memo: `Receipt ${p.receiptNo} for ${invoice.invoiceNo}`,
        lines: [
          { accountId: cashAccId, debit: amountBase, memo: "Cash received" },
          { accountId: accts.AR.id, credit: amountBase, memo: "Reduce AR" }
        ]
      });

      await tx.payment.update({ where: { id: p.id }, data: { postedJournalId: j.id } });

      return p;
    });

    await prisma.auditLog.create({
      data: { businessId, userId, action: "CREATE", entity: "Payment", entityId: payment.id, meta: payment as any }
    });

    return payment;
  }

  if (data.refType === "BILL") {
    const bill = await prisma.bill.findFirst({ where: { businessId, id: data.refId } });
    if (!bill) throw new HttpError(404, "Bill not found");

    const newBalance = Math.max(0, round(Number(bill.balance) - amount));
    const newStatus =
      newBalance === 0 ? "PAID" : (Number(bill.amount) === newBalance ? bill.status : "PARTIALLY_PAID");

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          businessId,
          direction: "AP",
          billId: bill.id,
          counterpartyId: bill.vendorId ?? undefined,
          counterpartyName: bill.vendorName,
          receiptNo: await nextReceiptNo(tx, businessId),
          amount: amount as any,
          paidOn,
          method: data.method ?? undefined,
        cashAccountId: data.cashAccountId ?? undefined,
          notes: data.notes ?? undefined,
          currency: currency || bill.currency,
          fxRate: fxRate as any,
          amountBase: amountBase as any,
          fxGainLossBase: 0 as any
        }
      });

      await tx.bill.update({
        where: { id: bill.id },
        data: { balance: newBalance as any, status: newStatus as any }
      });

      const j = await postJournal({
        businessId,
        refType: "PAYMENT",
        refId: p.id,
        postedOn: paidOn,
        memo: `Payment ${p.receiptNo} for ${bill.billNo}`,
        lines: [
          { accountId: accts.AP.id, debit: amountBase, memo: "Reduce AP" },
          { accountId: accts.CASH.id, credit: amountBase, memo: "Cash paid" }
        ]
      });

      await tx.payment.update({ where: { id: p.id }, data: { postedJournalId: j.id } });

      return p;
    });

    await prisma.auditLog.create({
      data: { businessId, userId, action: "CREATE", entity: "Payment", entityId: payment.id, meta: payment as any }
    });

    return payment;
  }

  throw new HttpError(400, "Unsupported payment ref");
}

export async function get(businessId: string, id: string) {
  const item = await prisma.payment.findFirst({ where: { businessId, id }, include: { invoice: true, bill: true } });
  if (!item) throw new HttpError(404, "Payment not found");
  return item;
}

function round(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
