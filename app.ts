import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { notFound, errorHandler } from "./middleware/errors.js";

import { authRouter } from "./modules/auth/auth.router.js";
import { customersRouter } from "./modules/customers/customers.router.js";
import { vendorsRouter } from "./modules/vendors/vendors.router.js";
import { invoicesRouter } from "./modules/invoices/invoices.router.js";
import { billsRouter } from "./modules/bills/bills.router.js";
import { paymentsRouter } from "./modules/payments/payments.router.js";
import { expensesRouter } from "./modules/expenses/expenses.router.js";
import { reportsRouter } from "./modules/reports/reports.router.js";
import { subscriptionsRouter } from "./modules/subscriptions/subscriptions.router.js";
import { auditRouter } from "./modules/audit-log/audit.router.js";
import { settingsRouter } from "./modules/settings/settings.router.js";
import { currenciesRouter } from "./modules/currencies/currencies.router.js";
import { journalsRouter } from "./modules/journals/journals.router.js";
import { pdfRouter } from "./modules/pdf/pdf.router.js";
import { itemsRouter } from "./modules/items/items.router.js";
import { inventoryRouter } from "./modules/inventory/inventory.router.js";
import { accountsRouter } from "./modules/accounts/accounts.router.js";
import { bankAccountsRouter } from "./modules/bank-accounts/bank.router.js";
import { openingRouter } from "./modules/opening-balances/opening.router.js";

export function buildApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  // Serve uploaded receipt/attachment files
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/customers", customersRouter);
  app.use("/api/v1/vendors", vendorsRouter);
  app.use("/api/v1/invoices", invoicesRouter);
  app.use("/api/v1/bills", billsRouter);
  app.use("/api/v1/payments", paymentsRouter);
  app.use("/api/v1/expenses", expensesRouter);
  app.use("/api/v1/reports", reportsRouter);
  app.use("/api/v1/subscriptions", subscriptionsRouter);
  app.use("/api/v1/audit", auditRouter);
  app.use("/api/v1/settings", settingsRouter);
  app.use("/api/v1/currencies", currenciesRouter);
  app.use("/api/v1/journals", journalsRouter);
  app.use("/api/v1/pdf", pdfRouter);
  app.use("/api/v1/items", itemsRouter);
  app.use("/api/v1/inventory", inventoryRouter);
  app.use("/api/v1/accounts", accountsRouter);
  app.use("/api/v1/bank-accounts", bankAccountsRouter);
  app.use("/api/v1/opening-balances", openingRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
