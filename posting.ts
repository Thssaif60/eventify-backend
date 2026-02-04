import { prisma } from "../../config/db.js";

export type PostLine = { accountId: string; debit?: number; credit?: number; memo?: string };

function round(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

/**
 * Post a balanced journal entry (double-entry).
 * Accepts an optional Prisma client (e.g., transaction client) for atomic writes.
 */
export async function postJournal(
  args: {
    businessId: string;
    refType?: string | null;
    refId?: string | null;
    postedOn: Date;
    memo?: string | null;
    lines: PostLine[];
  },
  db: any = prisma
) {
  const lines = args.lines.map(l => ({
    accountId: l.accountId,
    debit: round(Number(l.debit || 0)) as any,
    credit: round(Number(l.credit || 0)) as any,
    memo: l.memo ?? undefined
  }));

  const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (round(debit) !== round(credit)) {
    throw new Error(`Unbalanced journal: debit=${debit} credit=${credit}`);
  }

  return db.journalEntry.create({
    data: {
      businessId: args.businessId,
      refType: args.refType ?? undefined,
      refId: args.refId ?? undefined,
      memo: args.memo ?? undefined,
      postedOn: args.postedOn,
      lines: { create: lines }
    },
    include: { lines: true }
  });
}
