import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription, requireNotLocked } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Inventory from "./inventory.service.js";

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth, requireApproved, requireActiveSubscription);

inventoryRouter.get("/moves", asyncHandler(async (req, res) => {
  const data = await Inventory.list(req.auth!.businessId!, req.query);
  res.json(data);
}));

inventoryRouter.post("/moves", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Inventory.create(req.auth!.businessId!, req.auth!.userId, req.body);
  res.status(201).json(data);
}));

inventoryRouter.get("/moves/:id", asyncHandler(async (req, res) => {
  const data = await Inventory.get(req.auth!.businessId!, req.params.id);
  res.json(data);
}));
