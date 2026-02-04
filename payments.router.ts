import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription, requireNotLocked } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Payments from "./payments.service.js";

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth, requireApproved, requireActiveSubscription);
paymentsRouter.get("/", asyncHandler(async (req, res) => {
  const data = await Payments.list(req.auth!.businessId!, req.query);
  res.json(data);
}));

paymentsRouter.post("/", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Payments.create(req.auth!.businessId!, req.auth!.userId, req.body);
  res.status(201).json(data);
}));

paymentsRouter.get("/:id", asyncHandler(async (req, res) => {
  const data = await Payments.get(req.auth!.businessId!, req.params.id);
  res.json(data);
}));
