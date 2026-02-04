import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { makePublicUrl } from "../utils/storage.js";
import { HttpError } from "../utils/httpError.js";

type TemplateId = "classic" | "modern" | "minimal";

/* ---------------- THEME ---------------- */

function themeCss() {
  return `
:root{
  --ev-primary:#c62828;
  --ev-bg:#070a12;
  --ev-text: rgba(0,0,0,0.92);
  --ev-muted: rgba(0,0,0,0.70);
  --ev-line: rgba(0,0,0,0.12);
  --ev-card: rgba(0,0,0,0.03);
  --ev-font: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
}
*{ box-sizing:border-box; }
body{ font-family: var(--ev-font); margin:0; padding:0; color: var(--ev-text); background:#fff; }
.h1{ font-size:22px; font-weight:700; }
.h2{ font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; color: var(--ev-muted); }
.p{ font-size:13px; line-height:1.55; }
.small{ font-size:12px; color: var(--ev-muted); }
.num{ font-variant-numeric: tabular-nums; }
.table{ width:100%; border-collapse:collapse; }
.table th{ font-size:12px; padding:10px 8px; border-bottom:1px solid var(--ev-line); color: var(--ev-muted); text-transform:uppercase; }
.table td{ font-size:13px; padding:10px 8px; border-bottom:1px solid var(--ev-line); }
.badge{ padding:4px 10px; border-radius:999px; background:rgba(198,40,40,.1); color:var(--ev-primary); font-weight:700; font-size:12px; }
.card{ border:1px solid var(--ev-line); background:#fff; border-radius:14px; padding:14px; }
.row{ display:flex; gap:16px; }
.col{ flex:1; }
.right{ text-align:right; }
.mt8{ margin-top:8px; } .mt12{ margin-top:12px; } .mt16{ margin-top:16px; } .mt24{ margin-top:24px; }
.hr{ height:1px; background:var(--ev-line); margin:14px 0; }
`;
}

/* ---------------- INVOICE ---------------- */

function renderInvoiceHtml(template: TemplateId, model: any) {
  const { business, settings, invoice, items } = model;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Invoice ${escapeHtml(invoice.invoiceNo)}</title>
<style>${themeCss()}</style>
</head>
<body>
<div style="padding:28px">
  <div class="row">
    <div class="col">
      ${settings?.pdfLogoUrl
        ? `<img src="${settings.pdfLogoUrl}" style="height:42px"/>`
        : `<div class="h1">${escapeHtml(business.name)}</div>`}
      ${settings?.pdfAddress ? `<div class="small mt8">${nl2br(escapeHtml(settings.pdfAddress))}</div>` : ""}
    </div>
    <div class="col right">
      <div class="badge">INVOICE</div>
      <div class="h1 num mt8">${escapeHtml(invoice.invoiceNo)}</div>
      <div class="small mt8">Issued: ${fmtDate(invoice.issuedOn)}</div>
      <div class="small">Due: ${fmtDate(invoice.dueOn)}</div>
    </div>
  </div>

  <table class="table mt16">
    <thead>
      <tr>
        <th>Item</th>
        <th class="right">Qty</th>
        <th class="right">Unit</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((i:any)=>`
        <tr>
          <td>${escapeHtml(i.name)}</td>
          <td class="right num">${fmtQty(i.qty)}</td>
          <td class="right num">${fmtMoney(i.unitPrice, invoice.currency || settings.baseCurrency)}</td>
          <td class="right num">${fmtMoney(i.lineTotal, invoice.currency || settings.baseCurrency)}</td>
        </tr>`).join("")}
    </tbody>
  </table>

  <div class="card mt16 right">
    <div class="small">Total</div>
    <div class="h1 num">${fmtMoney(invoice.amount, invoice.currency || settings.baseCurrency)}</div>
  </div>

  ${invoice.notes ? `<div class="card mt16"><div class="h2">Notes</div><div class="p mt8">${nl2br(escapeHtml(invoice.notes))}</div></div>` : ""}
  ${settings?.pdfFooter ? `<div class="small mt24">${nl2br(escapeHtml(settings.pdfFooter))}</div>` : ""}
</div>
</body>
</html>`;
}

/* ---------------- RECEIPT ---------------- */

function renderReceiptHtml(template: TemplateId, model: any) {
  const { business, settings, payment, ref } = model;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Receipt ${escapeHtml(payment.receiptNo || payment.id)}</title>
<style>${themeCss()}</style>
</head>
<body>
<div style="padding:28px">
  <div class="row">
    <div class="col">
      ${settings?.pdfLogoUrl
        ? `<img src="${settings.pdfLogoUrl}" style="height:42px"/>`
        : `<div class="h1">${escapeHtml(business.name)}</div>`}
    </div>
    <div class="col right">
      <div class="badge">PAYMENT RECEIPT</div>
      <div class="h1 num mt8">${escapeHtml(payment.receiptNo || payment.id)}</div>
      <div class="small mt8">Paid: ${fmtDate(payment.paidOn)}</div>
      ${ref ? `<div class="small">For ${escapeHtml(ref.type)} ${escapeHtml(ref.no)}</div>` : ""}
    </div>
  </div>

  <div class="card mt16">
    <div class="row">
      <div class="col">
        <div class="small">Counterparty</div>
        <div class="p">${escapeHtml(payment.counterpartyName || "")}</div>
      </div>
      <div class="col right">
        <div class="small">Amount</div>
        <div class="h1 num">${fmtMoney(payment.amount, payment.currency || settings.baseCurrency)}</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

/* ---------------- EXPENSE ---------------- */

function renderExpenseHtml(template: TemplateId, model: any) {
  const { business, settings, expense } = model;
  const atts = (expense.attachments || []).map((a:any)=>({
    ...a,
    url: makePublicUrl(a.url),
    isImg: ["image/jpeg","image/png","image/jpg"].includes(String(a.mime).toLowerCase())
  }));

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Expense ${escapeHtml(expense.id)}</title>
<style>${themeCss()}</style>
</head>
<body>
<div style="padding:28px">
  <div class="row">
    <div class="col">
      ${settings?.pdfLogoUrl
        ? `<img src="${settings.pdfLogoUrl}" style="height:42px"/>`
        : `<div class="h1">${escapeHtml(business.name)}</div>`}
    </div>
    <div class="col right">
      <div class="badge">EXPENSE</div>
      <div class="small mt8">${fmtDate(expense.spentOn)}</div>
    </div>
  </div>

  <div class="card mt16">
    <div class="p">${escapeHtml(expense.title)}</div>
    <div class="h1 num mt8">${fmtMoney(expense.amount, expense.currency || settings.baseCurrency)}</div>
  </div>

  ${atts.length ? `
  <div class="card mt16">
    <div class="h2">Attachments</div>
    ${atts.filter(a=>a.isImg).slice(0,3).map(a=>`
      <img src="${a.url}" style="max-width:240px;margin-top:8px;border:1px solid #ddd"/>
    `).join("")}
  </div>` : ""}

</div>
</body>
</html>`;
}

/* ---------------- PUBLIC EXPORTS ---------------- */

export async function invoiceHtml(businessId: string, invoiceId: string, t?: string) {
  const m = await buildInvoiceModel(businessId, invoiceId);
  return renderInvoiceHtml((t||m.settings?.pdfTemplate||"classic") as TemplateId, m);
}
export async function receiptHtml(businessId: string, paymentId: string, t?: string) {
  const m = await buildPaymentModel(businessId, paymentId);
  return renderReceiptHtml((t||m.settings?.pdfTemplate||"classic") as TemplateId, m);
}
export async function expenseHtml(businessId: string, expenseId: string, t?: string) {
  const m = await buildExpenseModel(businessId, expenseId);
  return renderExpenseHtml((t||m.settings?.pdfTemplate||"classic") as TemplateId, m);
}

/* ---------------- PDF ENGINE ---------------- */

async function htmlToPdf(html: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ args:["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil:"networkidle" });
    return Buffer.from(await page.pdf({ format:"A4", printBackground:true }));
  } finally {
    await browser.close();
  }
}

/* ---------------- MODELS ---------------- */

async function buildInvoiceModel(businessId:string, invoiceId:string) {
  const [business, settings, invoice] = await Promise.all([
    prisma.business.findUnique({ where:{id:businessId} }),
    prisma.businessSettings.findUnique({ where:{businessId} }),
    prisma.invoice.findFirst({ where:{id:invoiceId,businessId}, include:{ items:true } })
  ]);
  if (!business || !invoice) throw new HttpError(404,"Not found");
  return { business, settings, invoice, items: invoice.items };
}

async function buildPaymentModel(businessId:string, paymentId:string) {
  const payment = await prisma.payment.findFirst({ where:{id:paymentId,businessId} });
  if (!payment) throw new HttpError(404,"Payment not found");
  return { business:{}, settings:{}, payment, ref:null };
}

async function buildExpenseModel(businessId:string, expenseId:string) {
  const expense = await prisma.expense.findFirst({ where:{id:expenseId,businessId}, include:{ attachments:true } });
  if (!expense) throw new HttpError(404,"Expense not found");
  return { business:{}, settings:{}, expense };
}

/* ---------------- HELPERS ---------------- */

function fmtDate(d:any){ if(!d) return "-"; return new Date(d).toISOString().slice(0,10); }
function fmtQty(v:any){ return Number(v||0).toFixed(2).replace(/\.00$/,""); }
function fmtMoney(v:any,c:string){ return `${(c||"").toUpperCase()} ${Number(v||0).toFixed(2)}`; }

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    } as any)[c]
  );
}
function nl2br(s:string){ return s.replace(/\n/g,"<br/>"); }
