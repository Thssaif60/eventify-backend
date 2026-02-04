import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Bank from "./bank.service.js";

export const bankAccountsRouter = Router();
bankAccountsRouter.use(requireAuth, requireApproved, requireActiveSubscription);

bankAccountsRouter.get("/", asyncHandler(async (req, res) => {
  const data = await Bank.list(req.auth!.businessId!);
  res.json(data);
}));

bankAccountsRouter.post("/", asyncHandler(async (req, res) => {
  const created = await Bank.create(req.auth!.businessId!, req.auth!.userId!, req.body);
  res.status(201).json(created);
}));

bankAccountsRouter.put("/:id", asyncHandler(async (req, res) => {
  const updated = await Bank.update(req.auth!.businessId!, req.auth!.userId!, req.params.id, req.body);
  res.json(updated);
}));

bankAccountsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const out = await Bank.remove(req.auth!.businessId!, req.auth!.userId!, req.params.id);
  res.json(out);
}));
