import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";
import { ensureSystemAccounts } from "../accounting/systemAccounts.js";
import { postJournal } from "../accounting/posting.js";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(80).optional().default("General"),
  amount: z.coerce.number().positive(),
  spentOn: z.string().datetime().optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
  cashAccountId: z.string().uuid().optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  currency: z.string().min(0).max(10).optional().nullable(),
  fxRate: z.coerce.number().positive().optional().default(1),
  receiptUrl: z.string().url().optional().nullable(),
  receiptName: z.string().optional().nullable()
});
const UpdateSchema = CreateSchema.partial();

function round(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function list(businessId: string, query: any) {
  const category = (query?.category as string | undefined)?.trim();
  const items = await prisma.expense.findMany({
    where: { businessId, ...(category ? { category } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { attachments: true }
  });
  return { items };
}

export async function create(businessId: string, userId: string, input: unknown) {
  const accts = await ensureSystemAccounts(businessId, tx);
  const data = CreateSchema.parse(input);
  const amount = Number(data.amount);
  const fxRate = Number(data.fxRate || 1);

  const created = await prisma.expense.create({
    data: {
      businessId,
      title: data.title,
      category: data.category,
      amount: amount as any,
      spentOn: data.spentOn ? new Date(data.spentOn) : new Date(),
      paymentMethod: data.paymentMethod ?? undefined,
        cashAccountId: data.cashAccountId ?? undefined,
      vendorId: data.vendorId ?? undefined,
      notes: data.notes ?? undefined,
      currency: (data.currency || "").toUpperCase(),
      fxRate: fxRate as any,
      amountBase: round(amount * fxRate) as any,
      receiptUrl: data.receiptUrl ?? undefined,
      receiptName: data.receiptName ?? undefined
    }
  });

  const postedOn = created.spentOn ? new Date(created.spentOn as any) : new Date();
  const j = await postJournal({
    businessId,
    refType: "EXPENSE",
    refId: created.id,
    postedOn,
    memo: `Expense ${created.title}`,
    lines: [
      { accountId: accts.EXPENSE.id, debit: Number(created.amountBase), memo: created.category || "Expense" },
      { accountId: cashAccId, credit: Number(created.amountBase), memo: "Cash paid" }
    ]
  });

  await prisma.expense.update({ where: { id: created.id }, data: { postedJournalId: j.id } });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "CREATE", entity: "Expense", entityId: created.id, meta: created as any }
  });

  return created;
}

export async function get(businessId: string, id: string) {
  const item = await prisma.expense.findFirst({ where: { businessId, id }, include: { attachments: true } });
  if (!item) throw new HttpError(404, "Expense not found");
  return item;
}

export async function update(businessId: string, userId: string, id: string, input: unknown) {
  const data = UpdateSchema.parse(input);
  const existing = await get(businessId, id);

  const updated = await prisma.expense.update({
    where: { id },
    data: {
      title: data.title ?? undefined,
      category: data.category ?? undefined,
      amount: (data.amount as any) ?? undefined,
      spentOn: data.spentOn ? new Date(data.spentOn) : undefined,
      paymentMethod: data.paymentMethod ?? undefined,
        cashAccountId: data.cashAccountId ?? undefined,
      vendorId: data.vendorId ?? undefined,
      notes: data.notes ?? undefined,
      receiptUrl: data.receiptUrl ?? undefined,
      receiptName: data.receiptName ?? undefined
    }
  });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "UPDATE", entity: "Expense", entityId: id, meta: { before: existing, after: updated } }
  });

  return updated;
}

export async function remove(businessId: string, userId: string, id: string) {
  const existing = await get(businessId, id);
  await prisma.expense.delete({ where: { id } });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "DELETE", entity: "Expense", entityId: id, meta: existing as any }
  });

  return { ok: true };
}


export async function listAttachments(businessId: string, expenseId: string) {
  const expense = await prisma.expense.findFirst({ where: { businessId, id: expenseId }, include: { attachments: true } });
  if (!expense) throw new HttpError(404, "Expense not found");
  return { items: expense.attachments };
}

export async function addAttachment(
  businessId: string,
  userId: string,
  expenseId: string,
  att: { url: string; filename: string; mime?: string; size?: number; storageKey?: string; storageProvider?: "local"|"s3" }
) {
  const expense = await prisma.expense.findFirst({ where: { businessId, id: expenseId } });
  if (!expense) throw new HttpError(404, "Expense not found");

  const created = await prisma.expenseAttachment.create({
    data: {
      expenseId,
      url: att.url,
      filename: att.filename,
      mime: att.mime,
      size: att.size,
      storageKey: att.storageKey,
      storageProvider: att.storageProvider
    }
  });

  // keep backward-compatible single receipt fields (first attachment)
  if (!expense.receiptUrl) {
    await prisma.expense.update({ where: { id: expenseId }, data: { receiptUrl: att.url, receiptName: att.filename } });
  }

  await prisma.auditLog.create({
    data: { businessId, userId, action: "CREATE", entity: "ExpenseAttachment", entityId: created.id, meta: created as any }
  });

  return created;
}

export async function removeAttachment(businessId: string, userId: string, expenseId: string, attachmentId: string) {
  const expense = await prisma.expense.findFirst({ where: { businessId, id: expenseId }, include: { attachments: true } });
  if (!expense) throw new HttpError(404, "Expense not found");

  const att = expense.attachments.find(a => a.id === attachmentId);
  if (!att) throw new HttpError(404, "Attachment not found");

  await prisma.expenseAttachment.delete({ where: { id: attachmentId } });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "DELETE", entity: "ExpenseAttachment", entityId: attachmentId, meta: att as any }
  });

  return { ok: true };
}
