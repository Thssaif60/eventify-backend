
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription } from "../../middleware/guards.js";
import { getSettings, updateSettings, listPdfTemplates } from "./settings.service.js";
import { settingsPdfPreviewHtml, settingsPdfPreviewPdf } from "../../pdf/pdf.service.js";

export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireApproved, requireActiveSubscription);

settingsRouter.get("/", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const data = await getSettings(businessId);
    res.json(data);
  } catch (e) { next(e); }
});

settingsRouter.put("/", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const updated = await updateSettings(businessId, req.body);
    res.json({ settings: updated });
  } catch (e) { next(e); }
});

settingsRouter.get("/pdf/templates", (_req, res) => {
  res.json({ templates: listPdfTemplates() });
});


// PDF customization live preview (HTML for iframe) — send overrides without saving.
// POST body: { kind: "invoice"|"receipt"|"expense", template?: "classic"|"modern"|"minimal", overrides?: {pdfLogoUrl,pdfAddress,pdfFooter,pdfSignature,pdfTerms} }
settingsRouter.post("/pdf/preview", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const kind = (req.body?.kind || "invoice") as any;
    const template = (req.body?.template || "classic") as any;
    const overrides = req.body?.overrides || {};
    const html = await settingsPdfPreviewHtml(businessId, kind, template, overrides);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) { next(e); }
});

// PDF customization live preview (PDF download)
settingsRouter.post("/pdf/preview/pdf", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const kind = (req.body?.kind || "invoice") as any;
    const template = (req.body?.template || "classic") as any;
    const overrides = req.body?.overrides || {};
    const pdf = await settingsPdfPreviewPdf(businessId, kind, template, overrides);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="pdf-preview.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
});
