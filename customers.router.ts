import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Customers from "./customers.service.js";

export const customersRouter = Router();

customersRouter.use(requireAuth, requireApproved, requireActiveSubscription);

customersRouter.get("/", asyncHandler(async (req, res) => {
  const data = await Customers.list(req.auth!.businessId!, req.query);
  res.json(data);
}));

customersRouter.post("/", asyncHandler(async (req, res) => {
  const data = await Customers.create(req.auth!.businessId!, req.auth!.userId, req.body);
  res.status(201).json(data);
}));

customersRouter.get("/:id", asyncHandler(async (req, res) => {
  const data = await Customers.get(req.auth!.businessId!, req.params.id);
  res.json(data);
}));

customersRouter.put("/:id", asyncHandler(async (req, res) => {
  const data = await Customers.update(req.auth!.businessId!, req.auth!.userId, req.params.id, req.body);
  res.json(data);
}));

customersRouter.delete("/:id", asyncHandler(async (req, res) => {
  const data = await Customers.remove(req.auth!.businessId!, req.auth!.userId, req.params.id);
  res.json(data);
}));
