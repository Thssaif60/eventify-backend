
import { prisma } from "../../config/db.js";
import { z } from "zod";

const QuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  refType: z.string().optional(),
  refId: z.string().optional(),
  q: z.string().optional()
});

export async function listJournals(businessId: string, input: unknown) {
  const q = QuerySchema.parse(input);
  const where: any = { businessId };

  if (q.from || q.to) {
    where.postedOn = {};
    if (q.from) where.postedOn.gte = new Date(q.from);
    if (q.to) where.postedOn.lte = new Date(q.to);
  }
  if (q.refType) where.refType = q.refType;
  if (q.refId) where.refId = q.refId;

  const journals = await prisma.journalEntry.findMany({
    where,
    orderBy: { postedOn: "desc" },
    take: 200,
    include: {
      lines: {
        include: { account: { select: { code: true, name: true, type: true } } }
      }
    }
  });

  // simple text search client-side if provided (memo/account)
  if (q.q) {
    const needle = q.q.toLowerCase();
    return journals.filter(j =>
      (j.memo || "").toLowerCase().includes(needle) ||
      j.lines.some(l => (l.memo || "").toLowerCase().includes(needle) || (l.account.name || "").toLowerCase().includes(needle))
    );
  }

  return journals;
}
