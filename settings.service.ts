
import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";
import { z } from "zod";

const UpdateSettingsSchema = z.object({
  baseCurrency: z.string().min(2).max(10).optional(),
  multiCurrency: z.boolean().optional(),
  currencyRules: z.any().optional(),

  openingCash: z.number().optional(),
  lockUntilDate: z.string().optional().nullable(),

  invoicePrefix: z.string().min(1).max(20).optional(),
  invoiceNextNo: z.number().int().min(1).optional(),
  billPrefix: z.string().min(1).max(20).optional(),
  billNextNo: z.number().int().min(1).optional(),

  pdfTemplate: z.string().min(1).max(32).optional(),
  pdfLogoUrl: z.string().url().optional().nullable(),
  pdfAddress: z.string().max(2000).optional().nullable(),
  pdfFooter: z.string().max(2000).optional().nullable(),
  pdfSignature: z.string().max(2000).optional().nullable(),
  pdfTerms: z.string().max(4000).optional().nullable(),

  lang: z.string().min(2).max(10).optional(),
  scheme: z.string().min(3).max(10).optional()
});

export async function getSettings(businessId: string) {
  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, baseCurrency: true, country: true, timezone: true }
  });
  if (!biz) throw new HttpError(404, "Business not found");

  const settings = await prisma.businessSettings.upsert({
    where: { businessId },
    update: {},
    create: { businessId, baseCurrency: biz.baseCurrency }
  });

  return { business: biz, settings };
}

export async function updateSettings(businessId: string, input: unknown) {
  const data = UpdateSettingsSchema.parse(input);

  const current = await prisma.businessSettings.upsert({
    where: { businessId },
    update: {},
    create: { businessId }
  });

  const baseCurrency = data.baseCurrency ? data.baseCurrency.toUpperCase() : current.baseCurrency;

  // keep Business baseCurrency in sync
  await prisma.business.update({ where: { id: businessId }, data: { baseCurrency } });

  const updated = await prisma.businessSettings.update({
    where: { businessId },
    data: {
      baseCurrency,
      multiCurrency: data.multiCurrency ?? undefined,
      currencyRules: data.currencyRules ?? undefined,

      openingCash: data.openingCash !== undefined ? data.openingCash : undefined,
      lockUntilDate: data.lockUntilDate === undefined ? undefined : (data.lockUntilDate ? new Date(data.lockUntilDate) : null),

      invoicePrefix: data.invoicePrefix ?? undefined,
      invoiceNextNo: data.invoiceNextNo ?? undefined,
      billPrefix: data.billPrefix ?? undefined,
      billNextNo: data.billNextNo ?? undefined,

      pdfTemplate: data.pdfTemplate ?? undefined,
      pdfLogoUrl: data.pdfLogoUrl === undefined ? undefined : data.pdfLogoUrl,
      pdfAddress: data.pdfAddress === undefined ? undefined : data.pdfAddress,
      pdfFooter: data.pdfFooter === undefined ? undefined : data.pdfFooter,
      pdfSignature: data.pdfSignature === undefined ? undefined : data.pdfSignature,
      pdfTerms: data.pdfTerms === undefined ? undefined : data.pdfTerms,

      lang: data.lang ?? undefined,
      scheme: data.scheme ?? undefined
    }
  });

  return updated;
}

export function listPdfTemplates() {
  return [
    { id: "classic", name: "Classic" },
    { id: "modern", name: "Modern" },
    { id: "minimal", name: "Minimal" }
  ];
}
