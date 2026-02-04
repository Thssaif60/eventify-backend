import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription, requireNotLocked } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Expenses from "./expenses.service.js";
import { storage } from "../../utils/storage.js";

export const expensesRouter = Router();

// Use memory upload and push to storage provider (local or S3)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

expensesRouter.use(requireAuth, requireApproved, requireActiveSubscription);
expensesRouter.get("/", asyncHandler(async (req, res) => {
  const data = await Expenses.list(req.auth!.businessId!, req.query);
  res.json(data);
}));

expensesRouter.post("/", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Expenses.create(req.auth!.businessId!, req.auth!.userId, req.body);
  res.status(201).json(data);
}));

expensesRouter.get("/:id", asyncHandler(async (req, res) => {
  const data = await Expenses.get(req.auth!.businessId!, req.params.id);
  res.json(data);
}));

expensesRouter.put("/:id", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Expenses.update(req.auth!.businessId!, req.auth!.userId, req.params.id, req.body);
  res.json(data);
}));

expensesRouter.delete("/:id", requireNotLocked, asyncHandler(async (req, res) => {
  const data = await Expenses.remove(req.auth!.businessId!, req.auth!.userId, req.params.id);
  res.json(data);
}));


// Attachments
expensesRouter.get("/:id/attachments", asyncHandler(async (req, res) => {
  const data = await Expenses.listAttachments(req.auth!.businessId!, req.params.id);
  res.json(data);
}));

expensesRouter.post("/:id/attachments", requireNotLocked, upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw new Error("No file uploaded");
  const stored = await storage.uploadExpenseAttachment({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mime: req.file.mimetype
  });
  const att = await Expenses.addAttachment(req.auth!.businessId!, req.auth!.userId, req.params.id, {
    url: stored.url,
    filename: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size,
    storageKey: stored.key,
    storageProvider: stored.provider
  });
  res.status(201).json(att);
}));

expensesRouter.delete("/:id/attachments/:attachmentId", requireNotLocked, asyncHandler(async (req, res) => {
  const out = await Expenses.removeAttachment(req.auth!.businessId!, req.auth!.userId, req.params.id, req.params.attachmentId);
  res.json(out);
}));
