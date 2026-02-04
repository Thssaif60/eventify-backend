import { prisma } from "../../config/db.js";

function parseRange(q: any) {
  const start = q?.start ? new Date(String(q.start)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = q?.end ? new Date(String(q.end)) : new Date();
  return { start, end };
}

function round(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

export async function profitAndLoss(businessId: string, q: any) {
  const { start, end } = parseRange(q);

  // Journal-based P&L (real accounting)
  const rows = await prisma.$queryRawUnsafe<Array<{ type: string; debit: any; credit: any }>>(
    `
    SELECT a.type as type,
           COALESCE(SUM(l.debit),0) as debit,
           COALESCE(SUM(l.credit),0) as credit
    FROM "JournalLine" l
    JOIN "JournalEntry" j ON j.id = l."journalId"
    JOIN "Account" a ON a.id = l."accountId"
    WHERE j."businessId" = $1
      AND j."postedOn" IS NOT NULL
      AND j."postedOn" >= $2 AND j."postedOn" <= $3
      AND a.type IN ('INCOME','EXPENSE')
    GROUP BY a.type
    `,
    businessId, start, end
  );

  const income = rows.find(r => r.type === "INCOME");
  const expense = rows.find(r => r.type === "EXPENSE");

  const revenue = round(Number(income?.credit || 0) - Number(income?.debit || 0));
  const expenses = round(Number(expense?.debit || 0) - Number(expense?.credit || 0));
  const net = round(revenue - expenses);

  return { start, end, revenue, expenses, net };
}

export async function pnlDrilldown(businessId: string, q: any) {
  const { start, end } = parseRange(q);
  const kind = String(q?.kind || "revenue").toLowerCase();
  const types = kind === "expense" ? ["EXPENSE"] : ["INCOME"];

  const rows = await prisma.journalLine.findMany({
    where: {
      journal: { businessId, postedOn: { gte: start, lte: end } },
      account: { type: { in: types as any } }
    },
    orderBy: [{ journal: { postedOn: "asc" } }, { id: "asc" }],
    include: { account: true, journal: true }
  });

  return { start, end, kind, items: rows };
}

export async function cashFlow(businessId: string, q: any) {
  const { start, end } = parseRange(q);

  // Cashflow from CASH account movements
  const rows = await prisma.$queryRawUnsafe<Array<{ debit: any; credit: any }>>(
    `
    SELECT COALESCE(SUM(l.debit),0) as debit,
           COALESCE(SUM(l.credit),0) as credit
    FROM "JournalLine" l
    JOIN "JournalEntry" j ON j.id = l."journalId"
    JOIN "Account" a ON a.id = l."accountId"
    WHERE j."businessId" = $1
      AND j."postedOn" IS NOT NULL
      AND j."postedOn" >= $2 AND j."postedOn" <= $3
      AND a.code = '1000'
    `,
    businessId, start, end
  );

  const inflows = round(Number(rows[0]?.debit || 0));
  const outflows = round(Number(rows[0]?.credit || 0));
  return { start, end, inflows, outflows, net: round(inflows - outflows) };
}

export async function cashflowDrilldown(businessId: string, q: any) {
  const { start, end } = parseRange(q);
  const kind = String(q?.kind || "in").toLowerCase() === "out" ? "out" : "in";

  const lines = await prisma.journalLine.findMany({
    where: {
      journal: { businessId, postedOn: { gte: start, lte: end } },
      account: { code: "1000" },
      ...(kind === "in" ? { debit: { gt: 0 } } : { credit: { gt: 0 } })
    },
    orderBy: [{ journal: { postedOn: "asc" } }, { id: "asc" }],
    include: { account: true, journal: true }
  });

  return { start, end, kind, items: lines };
}

export async function trialBalance(businessId: string, q: any) {
  const { start, end } = parseRange(q);

  const rows = await prisma.$queryRawUnsafe<Array<{ accountId: string; code: string; name: string; type: string; debit: any; credit: any }>>(
    `
    SELECT a.id as "accountId", a.code, a.name, a.type,
           COALESCE(SUM(l.debit),0) as debit,
           COALESCE(SUM(l.credit),0) as credit
    FROM "Account" a
    LEFT JOIN "JournalLine" l ON l."accountId" = a.id
    LEFT JOIN "JournalEntry" j ON j.id = l."journalId"
    WHERE a."businessId" = $1
      AND (j."postedOn" IS NULL OR (j."postedOn" >= $2 AND j."postedOn" <= $3))
    GROUP BY a.id, a.code, a.name, a.type
    ORDER BY a.code ASC
    `,
    businessId, start, end
  );

  const totals = rows.reduce((acc, r) => {
    acc.debit += Number(r.debit || 0);
    acc.credit += Number(r.credit || 0);
    return acc;
  }, { debit: 0, credit: 0 });

  return { start, end, rows, totals: { debit: round(totals.debit), credit: round(totals.credit) } };
}

export async function generalLedger(businessId: string, q: any) {
  const { start, end } = parseRange(q);
  const accountCode = String(q?.accountCode || "").trim();
  if (!accountCode) throw new Error("accountCode is required");

  const account = await prisma.account.findFirst({ where: { businessId, code: accountCode } });
  if (!account) throw new Error("Account not found");

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: account.id,
      journal: { businessId, postedOn: { gte: start, lte: end } }
    },
    orderBy: [{ journal: { postedOn: "asc" } }, { id: "asc" }],
    include: { journal: true }
  });

  let running = 0;
  const items = lines.map(l => {
    running += Number(l.debit || 0) - Number(l.credit || 0);
    return { ...l, runningBalance: round(running) };
  });

  return { start, end, account: { code: account.code, name: account.name, type: account.type }, items };
}

export async function aging(businessId: string, q: any) {
  const type = String(q?.type || "AR").toUpperCase() === "AP" ? "AP" : "AR";
  const now = new Date();

  if (type === "AR") {
    const invoices = await prisma.invoice.findMany({
      where: { businessId, balance: { gt: 0 }, status: { in: ["APPROVED", "SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { id: true, invoiceNo: true, customerName: true, dueOn: true, balance: true, currency: true }
    });

    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const items = invoices.map(i => {
      const due = i.dueOn || now;
      const days = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      const bal = Number(i.balance || 0);
      if (days <= 30) buckets["0-30"] += bal;
      else if (days <= 60) buckets["31-60"] += bal;
      else if (days <= 90) buckets["61-90"] += bal;
      else buckets["90+"] += bal;
      return { ...i, daysPastDue: days };
    });

    return { type, buckets, items };
  }

  const bills = await prisma.bill.findMany({
    where: { businessId, balance: { gt: 0 }, status: { in: ["APPROVED", "OPEN", "PARTIALLY_PAID", "OVERDUE"] } },
    select: { id: true, billNo: true, vendorName: true, dueOn: true, balance: true, currency: true }
  });

  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  const items = bills.map(b => {
    const due = b.dueOn || now;
    const days = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    const bal = Number(b.balance || 0);
    if (days <= 30) buckets["0-30"] += bal;
    else if (days <= 60) buckets["31-60"] += bal;
    else if (days <= 90) buckets["61-90"] += bal;
    else buckets["90+"] += bal;
    return { ...b, daysPastDue: days };
  });

  return { type, buckets, items };
}


export async function agingDrilldown(businessId: string, q: any) {
  const type = String(q?.type || "AR").toUpperCase() === "AP" ? "AP" : "AR";
  const bucket = String(q?.bucket || "0-30");
  const now = new Date();

  const inBucket = (days: number) => {
    if (bucket === "0-30") return days <= 30;
    if (bucket === "31-60") return days >= 31 && days <= 60;
    if (bucket === "61-90") return days >= 61 && days <= 90;
    return days >= 91;
  };

  if (type === "AR") {
    const invoices = await prisma.invoice.findMany({
      where: { businessId, balance: { gt: 0 }, status: { in: ["APPROVED", "SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { id: true, invoiceNo: true, customerName: true, customerId: true, dueOn: true, issuedOn: true, balance: true, amount: true, currency: true }
    });

    const items = invoices.map(i => {
      const due = i.dueOn || now;
      const days = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      return { ...i, daysPastDue: days };
    }).filter(i => inBucket(i.daysPastDue));

    return { type, bucket, count: items.length, items };
  }

  const bills = await prisma.bill.findMany({
    where: { businessId, balance: { gt: 0 }, status: { in: ["APPROVED", "OPEN", "PARTIALLY_PAID", "OVERDUE"] } },
    select: { id: true, billNo: true, vendorName: true, vendorId: true, dueOn: true, billedOn: true, balance: true, amount: true, currency: true }
  });

  const items = bills.map(b => {
    const due = b.dueOn || now;
    const days = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return { ...b, daysPastDue: days };
  }).filter(i => inBucket(i.daysPastDue));

  return { type, bucket, count: items.length, items };
}
