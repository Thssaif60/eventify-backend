import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { prisma } from "../../config/db.js";

export const auditRouter = Router();
auditRouter.use(requireAuth, requireApproved, requireActiveSubscription);

auditRouter.get("/", asyncHandler(async (req, res) => {
  const items = await prisma.auditLog.findMany({
    where: { businessId: req.auth!.businessId! },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json({ items });
}));
