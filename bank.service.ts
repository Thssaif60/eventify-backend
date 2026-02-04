import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";

const CreateSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  currency: z.string().max(10).optional().nullable(),
  openingBalance: z.coerce.number().optional().default(0),
  bankName: z.string().max(200).optional().nullable(),
  accountNumber: z.string().max(100).optional().nullable()
});

const UpdateSchema = CreateSchema.partial();

export async function list(businessId: string) {
  const items = await prisma.account.findMany({
    where: { businessId, subtype: "BANK" },
    orderBy: { code: "asc" }
  });
  return { items };
}

export async function create(businessId: string, userId: string, input: unknown) {
  const data = CreateSchema.parse(input);
  const existing = await prisma.account.findUnique({ where: { businessId_code: { businessId, code: data.code } } });
  if (existing) throw new HttpError(409, "Account code already exists");

  const created = await prisma.account.create({
    data: {
      businessId,
      code: data.code,
      name: data.name,
      type: "ASSET",
      subtype: "BANK",
      currency: data.currency ?? "",
      openingBalance: data.openingBalance as any
    }
  });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "CREATE", entity: "BankAccount", entityId: created.id, meta: created as any }
  });

  return created;
}

export async function update(businessId: string, userId: string, id: string, input: unknown) {
  const data = UpdateSchema.parse(input);
  const acct = await prisma.account.findFirst({ where: { businessId, id, subtype: "BANK" } });
  if (!acct) throw new HttpError(404, "Bank account not found");
  if (acct.isSystem) throw new HttpError(403, "System accounts cannot be edited");

  if (data.code && data.code !== acct.code) {
    const existing = await prisma.account.findUnique({ where: { businessId_code: { businessId, code: data.code } } });
    if (existing) throw new HttpError(409, "Account code already exists");
  }

  const updated = await prisma.account.update({
    where: { id },
    data: {
      code: data.code ?? undefined,
      name: data.name ?? undefined,
      currency: data.currency ?? undefined,
      openingBalance: (data.openingBalance !== undefined ? data.openingBalance : undefined) as any
    }
  });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "UPDATE", entity: "BankAccount", entityId: updated.id, meta: updated as any }
  });

  return updated;
}

export async function remove(businessId: string, userId: string, id: string) {
  const acct = await prisma.account.findFirst({ where: { businessId, id, subtype: "BANK" } });
  if (!acct) throw new HttpError(404, "Bank account not found");
  if (acct.isSystem) throw new HttpError(403, "System accounts cannot be deleted");

  const used = await prisma.journalLine.findFirst({ where: { accountId: id }, select: { id: true } });
  if (used) throw new HttpError(409, "Bank account is used in journals and cannot be deleted");

  await prisma.account.delete({ where: { id } });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "DELETE", entity: "BankAccount", entityId: id, meta: acct as any }
  });

  return { ok: true };
}
