import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  openingAP: z.coerce.number().optional().default(0)
});

const UpdateSchema = CreateSchema.partial();

export async function list(businessId: string, query: any) {
  const q = (query?.q as string | undefined)?.trim();
  const items = await prisma.vendor.findMany({
    where: {
      businessId,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return { items };
}

export async function create(businessId: string, userId: string, input: unknown) {
  const data = CreateSchema.parse(input);
  const openingAP = Number(data.openingAP || 0);

  const created = await prisma.vendor.create({
    data: {
      businessId,
      name: data.name,
      email: data.email ?? undefined,
      phone: data.phone ?? undefined,
      address: data.address ?? undefined,
      notes: data.notes ?? undefined,
      openingAP,
      openingAPRemaining: openingAP
    }
  });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "CREATE", entity: "Vendor", entityId: created.id, meta: created as any }
  });

  return created;
}

export async function get(businessId: string, id: string) {
  const item = await prisma.vendor.findFirst({ where: { businessId, id } });
  if (!item) throw new HttpError(404, "Vendor not found");
  return item;
}

export async function update(businessId: string, userId: string, id: string, input: unknown) {
  const data = UpdateSchema.parse(input);
  const existing = await get(businessId, id);

  const updated = await prisma.vendor.update({
    where: { id },
    data: {
      name: data.name ?? undefined,
      email: data.email ?? undefined,
      phone: data.phone ?? undefined,
      address: data.address ?? undefined,
      notes: data.notes ?? undefined
    }
  });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "UPDATE", entity: "Vendor", entityId: id, meta: { before: existing, after: updated } }
  });

  return updated;
}

export async function remove(businessId: string, userId: string, id: string) {
  const existing = await get(businessId, id);
  const billCount = await prisma.bill.count({ where: { businessId, vendorId: id } });
  const expenseCount = await prisma.expense.count({ where: { businessId, vendorId: id } });
  if (billCount + expenseCount > 0) throw new HttpError(409, "Vendor has linked records; cannot delete");

  await prisma.vendor.delete({ where: { id } });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "DELETE", entity: "Vendor", entityId: id, meta: existing as any }
  });

  return { ok: true };
}
