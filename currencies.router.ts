
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription } from "../../middleware/guards.js";
import { listRates, upsertRate } from "./currencies.service.js";

export const currenciesRouter = Router();
currenciesRouter.use(requireAuth, requireApproved, requireActiveSubscription);

currenciesRouter.get("/rates", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const rates = await listRates(businessId);
    res.json({ rates });
  } catch (e) { next(e); }
});

currenciesRouter.post("/rates", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const created = await upsertRate(businessId, req.body);
    res.status(201).json({ rate: created });
  } catch (e) { next(e); }
});
