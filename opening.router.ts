import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Opening from "./opening.service.js";

export const openingRouter = Router();
openingRouter.use(requireAuth, requireApproved, requireActiveSubscription);

// Preview what will be posted (no writes)
openingRouter.post("/preview", asyncHandler(async (req, res) => {
  const data = await Opening.preview(req.auth!.businessId!, req.body);
  res.json(data);
}));

// Apply once (writes journals + balances + inventory lots)
openingRouter.post("/apply", asyncHandler(async (req, res) => {
  const data = await Opening.apply(req.auth!.businessId!, req.auth!.userId!, req.body);
  res.json(data);
}));
