
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription } from "../../middleware/guards.js";
import { invoiceHtml, invoicePdf, receiptHtml, receiptPdf, expenseHtml, expensePdf } from "../../pdf/pdf.service.js";

export const pdfRouter = Router();
pdfRouter.use(requireAuth, requireApproved, requireActiveSubscription);

// Live HTML preview for iframe
pdfRouter.get("/invoice/:id/preview", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const template = (req.query.template as string | undefined);
    const html = await invoiceHtml(businessId, req.params.id, template);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) { next(e); }
});

// Real PDF download
pdfRouter.get("/invoice/:id/download", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const template = (req.query.template as string | undefined);
    const pdf = await invoicePdf(businessId, req.params.id, template);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="invoice-${req.params.id}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
});


// Payment receipt live preview
pdfRouter.get("/payment/:id/preview", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const template = (req.query.template as string | undefined);
    const html = await receiptHtml(businessId, req.params.id, template);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) { next(e); }
});

// Payment receipt PDF
pdfRouter.get("/payment/:id/download", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const template = (req.query.template as string | undefined);
    const pdf = await receiptPdf(businessId, req.params.id, template);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="receipt-${req.params.id}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
});

// Expense live preview
pdfRouter.get("/expense/:id/preview", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const template = (req.query.template as string | undefined);
    const html = await expenseHtml(businessId, req.params.id, template);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) { next(e); }
});

// Expense PDF
pdfRouter.get("/expense/:id/download", async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId!;
    const template = (req.query.template as string | undefined);
    const pdf = await expensePdf(businessId, req.params.id, template);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="expense-${req.params.id}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
});
