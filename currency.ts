
import { prisma } from "../config/db.js";

/**
 * Resolves FX rate for a quote currency into the business base currency.
 * If quote == base, returns 1.
 * Pulls the latest CurrencyRate by asOf.
 */
export async function resolveFxRate(businessId: string, quote: string, base: string): Promise<number> {
  const q = (quote || "").toUpperCase();
  const b = (base || "").toUpperCase();
  if (!q || !b || q === b) return 1;

  const latest = await prisma.currencyRate.findFirst({
    where: { businessId, quote: q, base: b },
    orderBy: { asOf: "desc" },
    select: { rate: true }
  });

  return latest?.rate ? Number(latest.rate) : 1;
}
