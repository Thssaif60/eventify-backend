import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Vendors from "./vendors.service.js";

export const vendorsRouter = Router();
vendorsRouter.use(requireAuth, requireApproved, requireActiveSubscription);

vendorsRouter.get("/", asyncHandler(async (req, res) => {
  const data = await Vendors.list(req.auth!.businessId!, req.query);
  res.json(data);
}));

vendorsRouter.post("/", asyncHandler(async (req, res) => {
  const data = await Vendors.create(req.auth!.businessId!, req.auth!.userId, req.body);
  res.status(201).json(data);
}));

vendorsRouter.get("/:id", asyncHandler(async (req, res) => {
  const data = await Vendors.get(req.auth!.businessId!, req.params.id);
  res.json(data);
}));

vendorsRouter.put("/:id", asyncHandler(async (req, res) => {
  const data = await Vendors.update(req.auth!.businessId!, req.auth!.userId, req.params.id, req.body);
  res.json(data);
}));

vendorsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const data = await Vendors.remove(req.auth!.businessId!, req.auth!.userId, req.params.id);
  res.json(data);
}));
