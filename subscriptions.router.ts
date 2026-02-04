import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Subscriptions from "./subscriptions.service.js";

export const subscriptionsRouter = Router();
subscriptionsRouter.use(requireAuth, requireApproved, requireActiveSubscription);

subscriptionsRouter.get("/current", asyncHandler(async (req, res) => {
  const data = await Subscriptions.current(req.auth!.businessId!);
  res.json(data);
}));

subscriptionsRouter.post("/request-renewal", asyncHandler(async (req, res) => {
  const data = await Subscriptions.requestRenewal(req.auth!.businessId!, req.auth!.userId);
  res.json(data);
}));
