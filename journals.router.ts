
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription } from "../../middleware/guards.js";
import { listJournals } from "./journals.service.js";

export const journalsRouter = Router();
journalsRouter.use(requireAuth, requireApproved, requireActiveSubscription);

journalsRouter.get("/", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const journals = await listJournals(businessId, req.query);
    res.json({ journals });
  } catch (e) { next(e); }
});
