import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription, requireNotLocked } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Invoices from "./invoices.service.js";
import { pdfRouter } from "./pdf.router.js";

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth, requireApproved, requireActiveSubscription);
invoicesRouter.get("/", asyncHandler(async (req, res) => {
  const data = await Invoices.list(req.auth!.businessId!, req.query);
  res.json(data);
}));

invoicesRouter.post("/", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Invoices.create(req.auth!.businessId!, req.auth!.userId, req.body);
  res.status(201).json(data);
}));

invoicesRouter.get("/:id", asyncHandler(async (req, res) => {
  const data = await Invoices.get(req.auth!.businessId!, req.params.id);
  res.json(data);
}));

invoicesRouter.put("/:id", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Invoices.update(req.auth!.businessId!, req.auth!.userId, req.params.id, req.body);
  res.json(data);
}));

invoicesRouter.post("/:id/approve", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Invoices.approve(req.auth!.businessId!, req.auth!.userId, req.params.id);
  res.json(data);
}));

invoicesRouter.use("/:id/pdf", pdfRouter);
