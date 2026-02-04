
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { makePublicUrl } from "../utils/storage.js";
import { HttpError } from "../utils/httpError.js";

type TemplateId = "classic" | "modern" | "minimal";

function themeCss() {
  // Locked to your MU-plugin palette tokens (do NOT change):
  // --ev-primary: #c62828; --ev-bg: #070a12; --ev-text: rgba(255,255,255,.92)
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
.h1{ font-size:22px; font-weight:700; letter-spacing:0.2px; }
.h2{ font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; color: var(--ev-muted);}
.p{ font-size:13px; line-height:1.55; }
.small{ font-size:12px; color: var(--ev-muted); }
.num{ font-variant-numeric: tabular-nums; }
.table{ width:100%; border-collapse:collapse; }
.table th{ text-align:left; font-size:12px; padding:10px 8px; border-bottom:1px solid var(--ev-line); color: var(--ev-muted); text-transform:uppercase; letter-spacing:0.12em;}
.table td{ font-size:13px; padding:10px 8px; border-bottom:1px solid var(--ev-line); }
.badge{ display:inline-block; padding:4px 10px; border-radius:999px; background: rgba(198,40,40,0.10); color: var(--ev-primary); font-weight:700; font-size:12px;}
.card{ border:1px solid var(--ev-line); background: #fff; border-radius:14px; padding:14px;}
.row{ display:flex; gap:16px; }
.col{ flex:1; }
.right{ text-align:right; }
.mt8{ margin-top:8px; } .mt12{ margin-top:12px; } .mt16{ margin-top:16px; } .mt24{ margin-top:24px; }
.hr{ height:1px; background: var(--ev-line); margin:14px 0; }
`;
}

function renderInvoiceHtml(template: TemplateId, model: any) {
  const { business, settings, invoice, items } = model;
  const logo = settings?.pdfLogoUrl ? `<img src="${settings.pdfLogoUrl}" style="height:42px;object-fit:contain"/>` : `<div class="h1">${escapeHtml(business.name)}</div>`;
  const headerRight = `
    <div class="right">
      <div class="badge">INVOICE</div>
      <div class="h1 num mt8">${escapeHtml(invoice.invoiceNo)}</div>
      <div class="small mt8">Issued: <span class="num">${fmtDate(invoice.issuedOn)}</span></div>
      <div class="small">Due: <span class="num">${fmtDate(invoice.dueOn)}</span></div>
    </div>
  `;

  const address = settings?.pdfAddress ? `<div class="small mt8">${nl2br(escapeHtml(settings.pdfAddress))}</div>` : "";

  const totals = `
    <div class="card">
      <div class="row">
        <div class="col">
          <div class="small">Customer</div>
          <div class="p">${escapeHtml(invoice.customerName || "")}</div>
        </div>
        <div class="col right">
          <div class="small">Total</div>
          <div class="h1 num">${fmtMoney(invoice.amount, invoice.currency || settings.baseCurrency)}</div>
          <div class="small mt8">Balance</div>
          <div class="p num">${fmtMoney(invoice.balance, invoice.currency || settings.baseCurrency)}</div>
        </div>
      </div>
    </div>
  `;

  const notes = invoice.notes ? `<div class="card mt16"><div class="h2">Notes</div><div class="p mt8">${nl2br(escapeHtml(invoice.notes))}</div></div>` : "";

  const terms = settings?.pdfTerms ? `<div class="card mt16"><div class="h2">Terms</div><div class="p mt8">${nl2br(escapeHtml(settings.pdfTerms))}</div></div>` : "";

  const footer = settings?.pdfFooter ? `<div class="small mt24">${nl2br(escapeHtml(settings.pdfFooter))}</div>` : "";

  const table = `
    <table class="table mt16">
      <thead>
        <tr>
          <th style="width:46%">Item</th>
          <th style="width:12%" class="right">Qty</th>
          <th style="width:18%" class="right">Unit</th>
          <th style="width:24%" class="right">Line total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((it: any)=>`
          <tr>
            <td>${escapeHtml(it.name)}</td>
            <td class="right num">${fmtQty(it.qty)}</td>
            <td class="right num">${fmtMoney(it.unitPrice, invoice.currency || settings.baseCurrency)}</td>
            <td class="right num">${fmtMoney(it.lineTotal, invoice.currency || settings.baseCurrency)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  const modernBand = template === "modern" ? `<div style="height:10px;background:var(--ev-primary);"></div>` : "";
  const minimalHeader = template === "minimal" ? `<div class="h1">Invoice ${escapeHtml(invoice.invoiceNo)}</div>` : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Invoice ${escapeHtml(invoice.invoiceNo)}</title>
<style>${themeCss()}
.page{ padding:28px; }
.header{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.brand{ max-width:60%; }
</style>
</head>
<body>
${modernBand}
<div class="page">
  ${minimalHeader}
  <div class="header">
    <div class="brand">
      ${logo}
      ${address}
    </div>
    ${template === "minimal" ? "" : headerRight}
  </div>

  ${table}

  ${totals}

  ${notes}
  ${terms}

  ${settings?.pdfSignature ? `<div class="card mt16"><div class="h2">Signature</div><div class="p mt8">${nl2br(escapeHtml(settings.pdfSignature))}</div></div>` : ""}

  ${footer}
</div>
</body>
</html>`;
}


function renderReceiptHtml(template: TemplateId, model: any) {
  const { business, settings, payment, ref } = model;
  const logo = settings?.pdfLogoUrl ? `<img src="${settings.pdfLogoUrl}" style="height:42px;object-fit:contain"/>` : `<div class="h1">${escapeHtml(business.name)}</div>`;
  const title = payment.direction === "AP" ? "PAYMENT RECEIPT" : "PAYMENT RECEIPT";
  const badge = `<div class="badge">${title}</div>`;
  const receiptNo = payment.receiptNo || payment.id;
  const invoiceNo = payment?.invoice?.invoiceNo;
  const billNo = payment?.bill?.billNo;
  const customer = payment?.invoice?.customer || null;
  const vendor = payment?.bill?.vendor || null;

  const who = payment.counterpartyName
    || (payment.direction === "AP" ? (vendor?.name || payment?.bill?.vendorName || "Vendor") : (customer?.name || payment?.invoice?.customerName || "Customer"));

  const refLine = ref?.type
    ? `<div class="small">Applied to ${escapeHtml(ref.type)}: <span class="num">${escapeHtml(ref.no || ref.id || "")}</span></div>`
    : "";

  const profileBlock = payment.direction === "AP"
    ? (vendor ? `
        <div class="small mt8">Email: ${escapeHtml(vendor.email || "-")}</div>
        <div class="small">Address: ${vendor.address ? nl2br(escapeHtml(vendor.address)) : "-"}</div>
      ` : "")
    : (customer ? `
        <div class="small mt8">Email: ${escapeHtml(customer.email || "-")}</div>
        <div class="small">Address: ${customer.address ? nl2br(escapeHtml(customer.address)) : "-"}</div>
      ` : "");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(receiptNo)}</title>
<style>${themeCss()}
.page{ padding:28px; }
.header{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.brand{ max-width:60%; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">
      ${logo}
      ${settings?.pdfAddress ? `<div class="small mt8">${nl2br(escapeHtml(settings.pdfAddress))}</div>` : ""}
    </div>
    <div class="right">
      ${badge}
      <div class="h1 num mt8">${escapeHtml(receiptNo)}</div>
      <div class="small mt8">Paid on: <span class="num">${fmtDate(payment.paidOn)}</span></div>
      ${refLine}
    </div>
  </div>

  <div class="card mt16">
    <div class="row">
      <div class="col">
        <div class="small">${payment.direction === "AP" ? "Paid to" : "Received from"}</div>
        <div class="p">${escapeHtml(who)}</div>
        ${payment.method ? `<div class="small mt8">Method: ${escapeHtml(payment.method)}</div>` : ""}
      </div>
      <div class="col right">
        <div class="small">Amount</div>
        <div class="h1 num">${fmtMoney(payment.amount, payment.currency || settings.baseCurrency)}</div>
      </div>
    </div>
    ${payment.notes ? `<div class="hr"></div><div class="small">Notes</div><div class="p mt8">${nl2br(escapeHtml(payment.notes))}</div>` : ""}
  </div>

  ${settings?.pdfSignature ? `<div class="card mt16"><div class="h2">Signature</div><div class="p mt8">${nl2br(escapeHtml(settings.pdfSignature))}</div></div>` : ""}
  ${settings?.pdfFooter ? `<div class="small mt24">${nl2br(escapeHtml(settings.pdfFooter))}</div>` : ""}
</div>
</body>
</html>`;
}

function renderExpenseHtml(template: TemplateId, model: any) {
  const { business, settings, expense } = model;
  const logo = settings?.pdfLogoUrl ? `<img src="${settings.pdfLogoUrl}" style="height:42px;object-fit:contain"/>` : `<div class="h1">${escapeHtml(business.name)}</div>`;
  const badge = `<div class="badge">EXPENSE</div>`;
  const atts = (expense.attachments || []).map((a: any) => {
    const url = makePublicUrl(String(a.url || ""));
    const mime = String(a.mime || "").toLowerCase();
    const isImg = (mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png");
    return { ...a, url, isImg };
  });

  const attachments = atts.map((a: any) => {
    return `<li class="small"><a href="${escapeHtml(a.url)}">${escapeHtml(a.filename || a.url)}</a></li>`;
  }).join("");

  // Small embedded preview thumbnails for JPG/PNG receipts
  const previews = atts.filter((a: any)=>a.isImg).slice(0, 3).map((a: any) => {
    return `<div style="margin-top:10px;"><div class="small">Preview: ${escapeHtml(a.filename || "receipt")}</div><img src="${escapeHtml(a.url)}" style="display:block; margin-top:6px; max-width:260px; max-height:200px; border-radius:10px; border:1px solid var(--ev-line);" /></div>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Expense ${escapeHtml(expense.id)}</title>
<style>${themeCss()}
.page{ padding:28px; }
.header{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.brand{ max-width:60%; }
a{ color: var(--ev-primary); text-decoration:none; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">
      ${logo}
      ${settings?.pdfAddress ? `<div class="small mt8">${nl2br(escapeHtml(settings.pdfAddress))}</div>` : ""}
    </div>
    <div class="right">
      ${badge}
      <div class="small mt8">Date: <span class="num">${fmtDate(expense.spentOn)}</span></div>
      <div class="small">Category: ${escapeHtml(expense.category || "")}</div>
    </div>
  </div>

  <div class="card mt16">
    <div class="row">
      <div class="col">
        <div class="small">Title</div>
        <div class="p">${escapeHtml(expense.title)}</div>
        ${expense.vendor?.name ? `<div class="small mt8">Vendor: ${escapeHtml(expense.vendor.name)}</div>` : ""}
        ${expense.paymentMethod ? `<div class="small mt8">Payment: ${escapeHtml(expense.paymentMethod)}</div>` : ""}
      </div>
      <div class="col right">
        <div class="small">Amount</div>
        <div class="h1 num">${fmtMoney(expense.amount, expense.currency || settings.baseCurrency)}</div>
      </div>
    </div>
    ${expense.notes ? `<div class="hr"></div><div class="small">Notes</div><div class="p mt8">${nl2br(escapeHtml(expense.notes))}</div>` : ""}
  </div>

  ${attachments ? `<div class="card mt16"><div class="h2">Attachments</div><ul class="mt8" style="margin:8px 0 0 18px;">${attachments}</ul>${previews ? `<div class="mt12">${previews}</div>` : ""}</div>` : ""}

  ${settings?.pdfFooter ? `<div class="small mt24">${nl2br(escapeHtml(settings.pdfFooter))}</div>` : ""}
</div>
</body>
</html>`;
}

export async function buildPaymentModel(businessId: string, paymentId: string) {
  const [business, settings, payment] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { id:true, name:true } }),
    prisma.businessSettings.findUnique({ where: { businessId } }),
    prisma.payment.findFirst({
      where: { id: paymentId, businessId },
      include: {
        invoice: { include: { customer: true } },
        bill: { include: { vendor: true } }
      }
    })
  ]);

  if (!business) throw new HttpError(404, "Business not found");
  if (!payment) throw new HttpError(404, "Payment not found");

  const ref = payment.invoice ? { type: "Invoice", id: payment.invoice.id, no: payment.invoice.invoiceNo } :
              payment.bill ? { type: "Bill", id: payment.bill.id, no: payment.bill.billNo } : null;

  return { business, settings, payment, ref };
}

export async function receiptHtml(businessId: string, paymentId: string, templateOverride?: string) {
  const model = await buildPaymentModel(businessId, paymentId);
  const tmpl = (templateOverride || model.settings?.pdfTemplate || "classic") as TemplateId;
  return renderReceiptHtml(tmpl, model);
}

export async function receiptPdf(businessId: string, paymentId: string, templateOverride?: string) {
  const html = await receiptHtml(businessId, paymentId, templateOverride);
  return htmlToPdf(html);
}

export async function buildExpenseModel(businessId: string, expenseId: string) {
  const [business, settings, expense] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { id:true, name:true } }),
    prisma.businessSettings.findUnique({ where: { businessId } }),
    prisma.expense.findFirst({ where: { id: expenseId, businessId }, include: { vendor: true, attachments: true } })
  ]);

  if (!business) throw new HttpError(404, "Business not found");
  if (!expense) throw new HttpError(404, "Expense not found");

  return { business, settings, expense };
}

export async function expenseHtml(businessId: string, expenseId: string, templateOverride?: string) {
  const model = await buildExpenseModel(businessId, expenseId);
  const tmpl = (templateOverride || model.settings?.pdfTemplate || "classic") as TemplateId;
  return renderExpenseHtml(tmpl, model);
}

export async function expensePdf(businessId: string, expenseId: string, templateOverride?: string) {
  const html = await expenseHtml(businessId, expenseId, templateOverride);
  return htmlToPdf(html);
}

export async function settingsPdfPreviewHtml(businessId: string, kind: "invoice"|"receipt"|"expense", template: TemplateId, overrides: any) {
  const [business, current] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { id:true, name:true } }),
    prisma.businessSettings.findUnique({ where: { businessId } })
  ]);
  if (!business) throw new HttpError(404, "Business not found");

  const settings = { ...(current || {}), ...(overrides || {}), businessId };

  if (kind === "receipt") {
    const model = { business, settings, payment: { id:"PREVIEW", receiptNo:"RCT-000001", direction:"AR", counterpartyName:"Preview Customer", amount: 2500, currency: settings.baseCurrency, paidOn: new Date().toISOString(), method: "Bank Transfer", notes: "Preview notes" }, ref: { type:"Invoice", no:"INV-000001" } };
    return renderReceiptHtml(template, model);
  }
  if (kind === "expense") {
    const model = { business, settings, expense: { id:"PREVIEW", title:"Preview Expense", category:"General", amount: 199.99, currency: settings.baseCurrency, spentOn: new Date().toISOString(), paymentMethod:"Cash", notes:"Preview notes", vendor: { name:"Preview Vendor" }, attachments: [{ url:"https://example.com/receipt.jpg", filename:"receipt.jpg" }] } };
    return renderExpenseHtml(template, model);
  }

  const model = { business, settings, invoice: { invoiceNo:"INV-PREVIEW-0001", issuedOn:new Date().toISOString(), dueOn:new Date().toISOString(), customerName:"Preview Customer", amount: 1500, balance: 1500, currency: settings.baseCurrency, notes:"Preview notes" }, items: [{ name:"Service A", qty:1, unitPrice:1500, lineTotal:1500 }] };
  return renderInvoiceHtml(template, model);
}

export async function settingsPdfPreviewPdf(businessId: string, kind: "invoice"|"receipt"|"expense", template: TemplateId, overrides: any) {
  const html = await settingsPdfPreviewHtml(businessId, kind, template, overrides);
  return htmlToPdf(html);
}

async function htmlToPdf(html: string) {
  let chromium: any;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    throw new HttpError(500, "PDF engine not installed. Run: npm i playwright && npx playwright install chromium");
  }

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" }
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function buildInvoiceModel(businessId: string, invoiceId: string) {
  const [business, settings, invoice] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { id:true, name:true } }),
    prisma.businessSettings.findUnique({ where: { businessId } }),
    prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      include: { items: true }
    })
  ]);

  if (!business) throw new HttpError(404, "Business not found");
  if (!invoice) throw new HttpError(404, "Invoice not found");

  return { business, settings, invoice, items: invoice.items };
}

export async function invoiceHtml(businessId: string, invoiceId: string, templateOverride?: string) {
  const model = await buildInvoiceModel(businessId, invoiceId);
  const tmpl = (templateOverride || model.settings?.pdfTemplate || "classic") as TemplateId;
  return renderInvoiceHtml(tmpl, model);
}

export async function invoicePdf(businessId: string, invoiceId: string, templateOverride?: string) {
  const html = await invoiceHtml(businessId, invoiceId, templateOverride);

  // Playwright-based HTML->PDF (production-grade).
  // Install Chromium once: `npx playwright install chromium`
  let chromium: any;
  try {
    // dynamic import keeps dev installs lighter
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    throw new HttpError(500, "PDF engine not installed. Run: npm i playwright && npx playwright install chromium");
  }

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" }
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function fmtDate(d: any) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toISOString().slice(0,10);
}
function fmtQty(v: any) {
  const n = Number(v ?? 0);
  return n.toFixed(2).replace(/\.00$/, "");
}
function fmtMoney(v: any, ccy: string) {
  const n = Number(v ?? 0);
  const cur = (ccy || "").toUpperCase();
  return `${cur} ${n.toFixed(2)}`;
}
function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#39;" } as any)[c]);
}
function nl2br(s: string) {
  return s.replace(/\n/g, "<br/>");
}
