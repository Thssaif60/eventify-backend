
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/db.js";
import { HttpError } from "../utils/httpError.js";

/**
 * Matches your MU-plugin behavior:
 * - User must be approved by admin
 * - Subscription must be ACTIVE and not expired
 */
export async function requireApproved(req: Request, _res: Response, next: NextFunction) {
  const userId = req.auth?.userId;
  if (!userId) return next(new HttpError(401, "Unauthorized"));
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isApproved: true } });
  if (!user?.isApproved) return next(new HttpError(403, "Account pending approval"));
  return next();
}

export async function requireActiveSubscription(req: Request, _res: Response, next: NextFunction) {
  const businessId = req.auth?.businessId;
  if (!businessId) return next(new HttpError(400, "Missing business context"));
  const sub = await prisma.subscription.findFirst({
    where: { businessId },
    orderBy: { expiresAt: "desc" },
    select: { status: true, expiresAt: true }
  });
  if (!sub) return next(new HttpError(403, "No subscription found"));
  const now = new Date();
  if (sub.status !== "ACTIVE" || sub.expiresAt <= now) return next(new HttpError(403, "Subscription expired"));
  return next();
}

/**
 * Period lock: no mutations with effectiveDate <= lockUntilDate
 * If no effectiveDate is provided, we use "today".
 */
export async function requireNotLocked(req: Request, _res: Response, next: NextFunction) {
  const businessId = req.auth?.businessId;
  if (!businessId) return next(new HttpError(400, "Missing business context"));

  const effective = (req.body?.effectiveDate || req.body?.issuedOn || req.body?.billedOn || req.body?.paidOn || req.body?.spentOn) as string | undefined;
  const effectiveDate = effective ? new Date(effective) : new Date();

  const settings = await prisma.businessSettings.findUnique({
    where: { businessId },
    select: { lockUntilDate: true }
  });

  if (settings?.lockUntilDate) {
    const lock = new Date(settings.lockUntilDate);
    // inclusive lock: disallow <= lock
    if (effectiveDate <= lock) return next(new HttpError(423, `Period locked until ${lock.toISOString().slice(0,10)}`));
  }

  return next();
}
