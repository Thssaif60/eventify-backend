import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireApproved, requireActiveSubscription } from "../../middleware/guards.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as Reports from "./reports.service.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireApproved, requireActiveSubscription);

reportsRouter.get("/pnl", asyncHandler(async (req, res) => {
  const data = await Reports.profitAndLoss(req.auth!.businessId!, req.query);
  res.json(data);
}));

reportsRouter.get("/cashflow", asyncHandler(async (req, res) => {
  const data = await Reports.cashFlow(req.auth!.businessId!, req.query);
  res.json(data);
}));

reportsRouter.get("/aging", asyncHandler(async (req, res) => {
  const data = await Reports.aging(req.auth!.businessId!, req.query);
  res.json(data);
}));

reportsRouter.get("/aging/drilldown", asyncHandler(async (req, res) => {
  const data = await Reports.agingDrilldown(req.auth!.businessId!, req.query);
  res.json(data);
}));


reportsRouter.get("/pnl/drilldown", asyncHandler(async (req, res) => {
  const data = await Reports.pnlDrilldown(req.auth!.businessId!, req.query);
  res.json(data);
}));

reportsRouter.get("/cashflow/drilldown", asyncHandler(async (req, res) => {
  const data = await Reports.cashflowDrilldown(req.auth!.businessId!, req.query);
  res.json(data);
}));

reportsRouter.get("/trial-balance", asyncHandler(async (req, res) => {
  const data = await Reports.trialBalance(req.auth!.businessId!, req.query);
  res.json(data);
}));

reportsRouter.get("/general-ledger", asyncHandler(async (req, res) => {
  const data = await Reports.generalLedger(req.auth!.businessId!, req.query);
  res.json(data);
}));

// Simple CSV exports (download)
reportsRouter.get("/pnl/export.csv", asyncHandler(async (req, res) => {
  const data = await Reports.pnlDrilldown(req.auth!.businessId!, req.query);
  const rows = data.items.map((l: any) => ({
    date: l.journal.postedOn?.toISOString().slice(0,10) || "",
    account: `${l.account.code} ${l.account.name}`,
    debit: l.debit,
    credit: l.credit,
    memo: l.memo || "",
    refType: l.journal.refType || "",
    refId: l.journal.refId || ""
  }));
  const csv = ["date,account,debit,credit,memo,refType,refId"].concat(rows.map(r =>
    `${r.date},"${r.account}",${r.debit},${r.credit},"${String(r.memo).replace(/"/g,'""')}",${r.refType},${r.refId}`
  )).join("\\n");
  res.setHeader("Content-Type","text/csv");
  res.setHeader("Content-Disposition",`attachment; filename="pnl-${data.kind}.csv"`);
  res.send(csv);
}));

reportsRouter.get("/trial-balance/export.csv", asyncHandler(async (req, res) => {
  const data = await Reports.trialBalance(req.auth!.businessId!, req.query);
  const csv = ["code,name,type,debit,credit"].concat(data.rows.map((r: any) =>
    `${r.code},"${String(r.name).replace(/"/g,'""')}",${r.type},${r.debit},${r.credit}`
  )).join("\\n");
  res.setHeader("Content-Type","text/csv");
  res.setHeader("Content-Disposition",`attachment; filename="trial-balance.csv"`);
  res.send(csv);
}));
