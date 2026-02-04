
import { prisma } from "../../config/db.js";
import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";

const UpsertRateSchema = z.object({
  quote: z.string().min(2).max(10),
  base: z.string().min(2).max(10).optional(),
  rate: z.number().positive(),
  asOf: z.string().optional()
});

export async function listRates(businessId: string) {
  const rates = await prisma.currencyRate.findMany({
    where: { businessId },
    orderBy: { asOf: "desc" },
    take: 200
  });
  return rates;
}

export async function upsertRate(businessId: string, input: unknown) {
  const data = UpsertRateSchema.parse(input);
  const settings = await prisma.businessSettings.findUnique({ where: { businessId }, select: { baseCurrency: true }});
  if (!settings) throw new HttpError(404, "Settings not found");

  const base = (data.base || settings.baseCurrency).toUpperCase();
  const quote = data.quote.toUpperCase();

  const created = await prisma.currencyRate.create({
    data: {
      businessId,
      base,
      quote,
      rate: data.rate,
      asOf: data.asOf ? new Date(data.asOf) : new Date()
    }
  });

  return created;
}
