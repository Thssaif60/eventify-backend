import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional().nullable(),
  type: z.enum(["PRODUCT","SERVICE"]).default("PRODUCT"),
  category: z.string().max(120).optional().nullable(),
  unit: z.string().max(50).optional().nullable(),
  salesPrice: z.coerce.number().nonnegative().optional().default(0),
  purchaseCost: z.coerce.number().nonnegative().optional().default(0),
  isActive: z.coerce.boolean().optional().default(true)
});

const UpdateSchema = CreateSchema.partial();

export async function list(businessId: string, q: any) {
  const query = (q?.q as string | undefined)?.trim();
  const items = await prisma.item.findMany({
    where: {
      businessId,
      ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { code: { contains: query, mode: "insensitive" } }] } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 300
  });
  return { items };
}

export async function get(businessId: string, id: string) {
  const item = await prisma.item.findFirst({ where: { businessId, id } });
  if (!item) throw new HttpError(404, "Item not found");
  return item;
}

export async function create(businessId: string, userId: string, input: unknown) {
  const data = CreateSchema.parse(input);
  const created = await prisma.item.create({
    data: {
      businessId,
      name: data.name,
      code: data.code ?? undefined,
      type: data.type as any,
      category: data.category ?? undefined,
      unit: data.unit ?? undefined,
      salesPrice: data.salesPrice as any,
      purchaseCost: data.purchaseCost as any,
      isActive: data.isActive
    }
  });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "CREATE", entity: "Item", entityId: created.id, meta: created as any }
  });

  return created;
}

export async function update(businessId: string, userId: string, id: string, input: unknown) {
  const data = UpdateSchema.parse(input);
  const existing = await prisma.item.findFirst({ where: { businessId, id } });
  if (!existing) throw new HttpError(404, "Item not found");

  const updated = await prisma.item.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code ?? null } : {}),
      ...(data.type !== undefined ? { type: data.type as any } : {}),
      ...(data.category !== undefined ? { category: data.category ?? null } : {}),
      ...(data.unit !== undefined ? { unit: data.unit ?? null } : {}),
      ...(data.salesPrice !== undefined ? { salesPrice: data.salesPrice as any } : {}),
      ...(data.purchaseCost !== undefined ? { purchaseCost: data.purchaseCost as any } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {})
    }
  });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "UPDATE", entity: "Item", entityId: updated.id, meta: updated as any }
  });

  return updated;
}
