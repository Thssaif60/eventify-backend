import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";

export async function current(businessId: string) {
  const sub = await prisma.subscription.findFirst({
    where: { businessId },
    orderBy: { createdAt: "desc" }
  });
  if (!sub) throw new HttpError(404, "Subscription not found");
  return sub;
}

export async function requestRenewal(businessId: string, userId: string) {
  const sub = await prisma.subscription.findFirst({
    where: { businessId },
    orderBy: { createdAt: "desc" }
  });
  if (!sub) throw new HttpError(404, "Subscription not found");

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: { renewRequested: true }
  });

  await prisma.auditLog.create({
    data: { businessId, userId, action: "RENEW_REQUEST", entity: "Subscription", entityId: updated.id, meta: updated as any }
  });

  return updated;
}
