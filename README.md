# Eventify Backend (Node/Express + Postgres + Prisma)

This backend is a clean SaaS-style foundation for converting your WordPress MU-plugin into a real cloud accounting backend.

## Tech
- Node.js + Express + TypeScript
- Postgres + Prisma
- Auth: JWT (Access + Refresh) with refresh-token rotation storage
- PDF: HTML templates included + safe PDF stub (enable Playwright/Puppeteer later)

## Modules shipped
- Auth (register, login, refresh, me, switch-business)
- Customers (CRUD)
- Vendors (CRUD)
- Invoices (CRUD + approve + HTML invoice template endpoint)
- Bills (CRUD + approve)  // helps AP flows
- Payments (AR/AP payments; updates invoice/bill balance)
- Expenses (CRUD)
- Reports: P&L, Cash Flow, Aging (AR/AP)
- Subscriptions: current + renewal request flag
- Audit Log: recent actions

## Quick start (local)
1) Create a Postgres DB (Docker or local)
2) Copy env file
   - cp .env.example .env
   - Set DATABASE_URL and JWT secrets

3) Install
   - npm install

4) Create tables
   - npx prisma migrate dev --name init
   - npx prisma generate

5) Run
   - npm run dev
   - Health check: GET http://localhost:4000/health

## Notes about “same colors” + premium typography
Colors/typography are a frontend concern. This backend keeps your branding via PDF settings fields (logo, footer, address), but the dashboard colors and typography will be applied in the frontend (Vercel) project.

## Key API routes (examples)
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- GET  /api/v1/auth/me
- GET  /api/v1/customers
- POST /api/v1/invoices
- GET  /api/v1/invoices/:id/pdf/html   (returns HTML; easiest to preview)

## Enable real PDF generation
`src/pdf/pdf.service.ts` ships with HTML templates and a safe stub that returns 501 for PDF.
To enable server-side PDF:
- Install playwright or puppeteer
- Implement generatePdfBuffer(html) using your preferred engine


## Added (v20) — matched to your MU-plugin meta/flows
- Business Settings (period lock, numbering, PDF customization, language/scheme)
- Currency Rates (quote->base) + auto fx snapshot on invoice/bill creation
- Journals: Read-only journal viewer with date/ref filters
- Guards: approval gate + active subscription gate + period lock guard
- PDF Engine: Playwright HTML→PDF with template selector + live HTML preview endpoints



## Added (v20) — matched to your MU-plugin meta/flows
- **Business Settings** (period lock, numbering, PDF customization, language/scheme)
- **Currency Rates** (quote→base) + auto FX snapshot on invoice/bill create (if fxRate not provided)
- **Journals**: read-only journal viewer with date/ref/search filters
- **Guards**: approval gate + active subscription gate + period lock guard
- **PDF Engine**: real HTML→PDF (Playwright) with template selector + live preview

### Key endpoints
- `GET /api/v1/settings` / `PUT /api/v1/settings`
- `GET /api/v1/settings/pdf/templates`
- `GET /api/v1/currencies/rates` / `POST /api/v1/currencies/rates`
- `GET /api/v1/journals?from=YYYY-MM-DD&to=YYYY-MM-DD&refType=INVOICE&refId=...&q=...`
- `GET /api/v1/pdf/invoice/:id/preview?template=classic|modern|minimal`
- `GET /api/v1/pdf/invoice/:id/download?template=classic|modern|minimal`

### PDF engine setup
1. Install deps: `npm i`
2. Install Chromium once: `npx playwright install chromium`
3. Run API: `npm run dev`

## Added (v21+) — PDFs & attachments

### Payment receipt PDF (linked to invoice + customer info)
- `GET /api/v1/pdf/payment/:id/preview?template=classic|modern|minimal`
- `GET /api/v1/pdf/payment/:id/download?template=classic|modern|minimal`

Receipts automatically include the applied Invoice/Bill number and the Customer/Vendor profile fields (name/email/address) when available.

### Expense PDF + embedded receipt previews
- `GET /api/v1/pdf/expense/:id/preview?template=classic|modern|minimal`
- `GET /api/v1/pdf/expense/:id/download?template=classic|modern|minimal`

If an expense attachment is a JPG/PNG, the PDF embeds up to 3 small preview images.

### Attachments storage (local vs S3)

By default (`STORAGE_DRIVER=local`), uploads are stored under `uploads/` and served from this API under `/uploads/...`.

For production (Render/Fly/AWS), set `STORAGE_DRIVER=s3` and configure:
- `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- Optional: `S3_ENDPOINT` (for R2/Spaces/MinIO)
- Optional: `S3_PUBLIC_BASE_URL` (recommended) to generate public URLs (CDN or bucket URL)

Ensure `PDF_BASE_URL` points to your deployed API URL so Playwright can fetch `/uploads/...` assets when using local storage.
