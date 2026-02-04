import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";

const CreateSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  type: z.enum(["ASSET","LIABILITY","EQUITY","INCOME","EXPENSE"]),
  subtype: z.string().max(50).optional().nullable(),
  currency: z.string().max(10).optional().nullable()
});

const UpdateSchema = CreateSchema.partial();

export async function list(businessId: string, q: any) {
  const type = typeof q.type === "string" ? q.type : undefined;
  const subtype = typeof q.subtype === "string" ? q.subtype : undefined;
  const items = await prisma.account.findMany({
    where: {
      businessId,
      ...(type ? { type } : {}),
      ...(subtype ? { subtype } : {})
    },
    orderBy: [{ type: "asc" }, { code: "asc" }]
  });
  return { items };
}

export async function create(businessId: string, userId: string, input: unknown) {
  const data = CreateSchema.parse(input);
  // do not allow creating over an existing code
  const existing = await prisma.account.findUnique({ where: { businessId_code: { businessId, code: data.code } } });
  if (existing) throw new HttpError(409, "Account code already exists");

  const created = await prisma.account.create({
    data: {
      businessId,
      code: data.code,
      name: data.name,
      type: data.type,
      subtype: data.subtype ?? undefined,
      currency: data.currency ?? ""
    }
  });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "CREATE", entity: "Account", entityId: created.id, meta: created as any }
  });

  return created;
}

export async function update(businessId: string, userId: string, id: string, input: unknown) {
  const data = UpdateSchema.parse(input);
  const acct = await prisma.account.findFirst({ where: { businessId, id } });
  if (!acct) throw new HttpError(404, "Account not found");
  if (acct.isSystem) throw new HttpError(403, "System accounts cannot be edited");

  // if code is being changed, enforce uniqueness
  if (data.code && data.code !== acct.code) {
    const existing = await prisma.account.findUnique({ where: { businessId_code: { businessId, code: data.code } } });
    if (existing) throw new HttpError(409, "Account code already exists");
  }

  const updated = await prisma.account.update({
    where: { id },
    data: {
      code: data.code ?? undefined,
      name: data.name ?? undefined,
      type: data.type ?? undefined,
      subtype: data.subtype ?? undefined,
      currency: data.currency ?? undefined
    }
  });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "UPDATE", entity: "Account", entityId: updated.id, meta: updated as any }
  });

  return updated;
}

export async function remove(businessId: string, userId: string, id: string) {
  const acct = await prisma.account.findFirst({ where: { businessId, id } });
  if (!acct) throw new HttpError(404, "Account not found");
  if (acct.isSystem) throw new HttpError(403, "System accounts cannot be deleted");

  const used = await prisma.journalLine.findFirst({ where: { accountId: id }, select: { id: true } });
  if (used) throw new HttpError(409, "Account is used in journals and cannot be deleted");

  await prisma.account.delete({ where: { id } });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "DELETE", entity: "Account", entityId: id, meta: acct as any }
  });

  return { ok: true };
}
