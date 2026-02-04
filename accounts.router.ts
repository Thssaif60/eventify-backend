import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Accounts from "./accounts.service.js";

export const accountsRouter = Router();
accountsRouter.use(requireAuth, requireApproved, requireActiveSubscription);

accountsRouter.get("/", asyncHandler(async (req, res) => {
  const data = await Accounts.list(req.auth!.businessId!, req.query);
  res.json(data);
}));

accountsRouter.post("/", asyncHandler(async (req, res) => {
  const created = await Accounts.create(req.auth!.businessId!, req.auth!.userId!, req.body);
  res.status(201).json(created);
}));

accountsRouter.put("/:id", asyncHandler(async (req, res) => {
  const updated = await Accounts.update(req.auth!.businessId!, req.auth!.userId!, req.params.id, req.body);
  res.json(updated);
}));

accountsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const out = await Accounts.remove(req.auth!.businessId!, req.auth!.userId!, req.params.id);
  res.json(out);
}));
