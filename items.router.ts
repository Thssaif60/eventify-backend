import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription, requireNotLocked } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Items from "./items.service.js";

export const itemsRouter = Router();
itemsRouter.use(requireAuth, requireApproved, requireActiveSubscription);

itemsRouter.get("/", asyncHandler(async (req, res) => {
  const data = await Items.list(req.auth!.businessId!, req.query);
  res.json(data);
}));

itemsRouter.post("/", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Items.create(req.auth!.businessId!, req.auth!.userId, req.body);
  res.status(201).json(data);
}));

itemsRouter.get("/:id", asyncHandler(async (req, res) => {
  const data = await Items.get(req.auth!.businessId!, req.params.id);
  res.json(data);
}));

itemsRouter.put("/:id", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Items.update(req.auth!.businessId!, req.auth!.userId, req.params.id, req.body);
  res.json(data);
}));
