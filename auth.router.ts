import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Auth from "./auth.service.js";
import { requireAuth } from "../../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(async (req, res) => {
  const result = await Auth.register(req.body);
  res.status(201).json(result);
}));

authRouter.post("/login", asyncHandler(async (req, res) => {
  const result = await Auth.login(req.body);
  res.json(result);
}));

authRouter.post("/refresh", asyncHandler(async (req, res) => {
  const result = await Auth.refresh(req.body);
  res.json(result);
}));

authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const result = await Auth.me(req.auth!.userId, req.auth!.businessId);
  res.json(result);
}));

authRouter.post("/switch-business", requireAuth, asyncHandler(async (req, res) => {
  const result = await Auth.switchBusiness(req.auth!.userId, req.body);
  res.json(result);
}));
