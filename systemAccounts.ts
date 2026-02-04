import { prisma } from "../../config/db.js";

export type SystemAccountCode =
  | "CASH"
  | "AR"
  | "AP"
  | "REVENUE"
  | "EXPENSE"
  | "TAX_PAYABLE"
  | "TAX_INPUT"
  | "INVENTORY"
  | "COGS"
  | "WASTAGE"
  | "INVENTORY_ADJ"
  | "OPENING_EQUITY"
  | "SUSPENSE";

const defs: Record<SystemAccountCode, { code: string; name: string; type: "ASSET"|"LIABILITY"|"EQUITY"|"INCOME"|"EXPENSE" }> = {
  CASH:          { code: "1000", name: "Cash & Bank",              type: "ASSET" },
  AR:            { code: "1100", name: "Accounts Receivable",      type: "ASSET" },
  INVENTORY:     { code: "1200", name: "Inventory",               type: "ASSET" },

  TAX_INPUT:     { code: "1300", name: "Input VAT / Tax Recoverable", type: "ASSET" },

  AP:            { code: "2000", name: "Accounts Payable",         type: "LIABILITY" },
  TAX_PAYABLE:   { code: "2100", name: "Tax Payable",             type: "LIABILITY" },

  OPENING_EQUITY:{ code: "3000", name: "Opening Balance Equity",   type: "EQUITY" },

  REVENUE:       { code: "4000", name: "Sales Revenue",            type: "INCOME" },

  COGS:          { code: "5100", name: "Cost of Goods Sold",        type: "EXPENSE" },
  WASTAGE:       { code: "5200", name: "Inventory Wastage",         type: "EXPENSE" },
  INVENTORY_ADJ: { code: "5290", name: "Inventory Adjustments",     type: "EXPENSE" },
  EXPENSE:       { code: "5000", name: "General Expenses",          type: "EXPENSE" },

  SUSPENSE:      { code: "9999", name: "Suspense",                  type: "ASSET" }
};

async function ensureAccount(businessId: string, def: { code: string; name: string; type: string }, db: any) {
  const existing = await db.account.findUnique({ where: { businessId_code: { businessId, code: def.code } } });
  if (existing) return existing;
  return db.account.create({
    data: { businessId, code: def.code, name: def.name, type: def.type, isSystem: true }
  });
}

/** Ensures a minimal system chart of accounts exists for posting. */
export async function ensureSystemAccounts(businessId: string, db: any = prisma) {
  const entries = await Promise.all(Object.entries(defs).map(async ([k, def]) => {
    const acct = await ensureAccount(businessId, def, db);
    return [k, acct] as const;
  }));
  const map = Object.fromEntries(entries) as Record<SystemAccountCode, { id: string; code: string; name: string; type: string }>;
  return map;
}
