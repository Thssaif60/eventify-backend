import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription, requireNotLocked } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Bills from "./bills.service.js";

export const billsRouter = Router();
billsRouter.use(requireAuth, requireApproved, requireActiveSubscription);
billsRouter.get("/", asyncHandler(async (req, res) => {
  const data = await Bills.list(req.auth!.businessId!, req.query);
  res.json(data);
}));

billsRouter.post("/", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Bills.create(req.auth!.businessId!, req.auth!.userId, req.body);
  res.status(201).json(data);
}));

billsRouter.get("/:id", asyncHandler(async (req, res) => {
  const data = await Bills.get(req.auth!.businessId!, req.params.id);
  res.json(data);
}));

billsRouter.put("/:id", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Bills.update(req.auth!.businessId!, req.auth!.userId, req.params.id, req.body);
  res.json(data);
}));

billsRouter.post("/:id/approve", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Bills.approve(req.auth!.businessId!, req.auth!.userId, req.params.id);
  res.json(data);
}));
