# eBAQ Commerce Template — Implementation Plan (for Haiku 5.5)

> Audience: an implementing agent (Haiku 5.5) working stage by stage in an EMPTY repo
> `ecommerce-basic` (remote: `https://github.com/bianjieandara/ecommerce-basic.git`, branch `main`).
> All code, identifiers, comments and docs are in **English**. Store UI is **bilingual (es/en)**.

---

## 0. Context

We are building a reusable, lightweight "WordPress-like" e-commerce **template** that we customize per client.
**All client stores live in OUR Cloudflare account** (one Worker + D1 + R2 + KV + Queue per client, same codebase,
one script deploys/updates all). A client that wants to own their account gets the same deployment there.
Goals: very low running cost (Cloudflare-only stack; build ourselves instead of buying SaaS), mobile-first
(99% of traffic is mobile), fast, simple design with good animations, hexagonal architecture, component-based UI,
no duplicated code, fully documented. **No automated tests for now** (verification = `npm run check`,
`npm run build` and manual smoke steps per stage).

Locked decisions (approved by the user):

| Topic | Decision |
|---|---|
| Hosting model | Our Cloudflare account hosts all clients: one Worker + D1 + R2 + KV + Queue per client. Optional: client's own account |
| Framework | Astro (latest stable) + `@astrojs/cloudflare`, `output: "server"`, custom Worker entrypoint (`fetch` + `queue` + `scheduled`) |
| Interactivity | Preact islands only where needed; nanostores for shared client state |
| Styling | Tailwind CSS v4 + CSS custom properties (tokens from admin "Theme" settings) |
| DB | Cloudflare D1 (SQLite) + FTS5 search |
| Media | R2; images resized **in the browser** at upload (zero transformation cost) |
| Background work | **Cloudflare Queues** (one queue + dead-letter queue per client) + one Cron Trigger per client |
| Cache | Workers Cache API with version-key invalidation in KV |
| Admin auth | Own email + password (PBKDF2 WebCrypto), sessions in D1, Turnstile + Rate Limiting binding |
| Payments | dLocal Go (hosted checkout), PayPal (Orders v2 via fetch), WhatsApp order (wa.me), Bank transfer, Cash on delivery |
| Catalog filters | Faceted filters with counts (categories, attributes, price, availability, on sale, new), canonical URLs |
| Variants | Global attributes (Size, Color…) → variants with own SKU/barcode/price/cost/stock |
| Inventory | Stock ledger (every movement recorded), low-stock alerts, back-in-stock subscriptions, CSV import/export, barcode scan |
| Languages | Full bilingual `/es` + `/en`, translated products/categories/pages, language switcher |
| Taxes | Store-level tax (e.g. IVA 19%), prices incl./excl. tax, per-product override |
| Invoices | Own invoice (series + consecutive, tax breakdown) + `LegalInvoiceIssuer` port for a future certified provider; PDF via Browser Run, stored in R2 |
| Notifications | Multichannel: Email (Cloudflare Email Service, templates editable in admin) + **WhatsApp Cloud API (Meta) with approved message templates** |
| Marketing | **Meta adapter**: Pixel (consent-gated) + Conversions API (server, deduplicated) + product catalog feed (also valid for Google Merchant) |
| Reports | Sales, products, categories, payments, shipping, taxes, invoices, inventory, customers, funnel (Analytics Engine), CSV export, weekly summary |
| Bot protection | Turnstile |
| Analytics | Workers Analytics Engine (own events, cookieless) + Cloudflare Web Analytics |
| Optional AI | Workers AI for ES↔EN translation in admin |

---

## 1. Cloudflare services map and cost model

| Need | Product | Binding | Notes |
|---|---|---|---|
| SSR + API + static assets | Workers + Static Assets | `ASSETS` | Static requests free. Max 500 Workers per paid account |
| Relational data | D1 (one DB per client) | `DB` | Paid: 25B rows read + 50M written/month included (shared by all clients) |
| Images, invoice PDFs | R2 (one bucket per client) | `MEDIA` | 10 GB free, zero egress |
| Small cache/state | KV (one namespace per client) | `CACHE` | Max 1,000 namespaces per account |
| Page cache | Cache API | — | Only on custom domains (not `*.workers.dev`) |
| Background jobs | Queues (`<slug>-jobs` + `<slug>-jobs-dlq`) | `JOBS` | Free plan: 10k ops/day; Paid: monthly ops included then per-million price (≈3 ops per message). Max 10,000 queues/account. Retry delay up to 24 h |
| Scheduled work | Cron Triggers | — | **Max 250 per account → use exactly ONE cron expression per client** (dispatch internally) |
| Email | Email Service | `EMAIL` | Workers Paid: 3,000 emails/month included per account (shared), then $0.35/1,000. Max 5 MiB incl. attachments |
| Invoice PDFs | Browser Run quick action `pdf` | `BROWSER` | Paid: 10 browser-hours/month included (shared), then $0.09/h. `compatibility_date` ≥ 2026-03-24; `"remote": true` in local dev |
| Own analytics events | Workers Analytics Engine | `EVENTS` | Dataset per client `<slug>_events`; ~3 months retention → nightly rollup into D1 |
| Query own analytics | Analytics SQL binding | `ANALYTICS_SQL` | No API token needed; Wrangler ≥ 4.145.0; always remote |
| Abuse protection | Rate Limiting | `RL_AUTH`, `RL_FORMS`, `RL_API` | `period` 10 or 60; `namespace_id` unique per client |
| Bot protection | Turnstile | secret | Free |
| AI (optional) | Workers AI | `AI` | Free daily allocation (shared) |

External (paid by the client or per use): domains, dLocal Go/PayPal fees, **Meta WhatsApp template messages (Meta charges per
delivered template message by category and country)**, Google Places (1 call/day/store, within free cap), certified e-invoicing
provider only if needed. Account plan: **Workers Paid ($5/month) on our account covers all stores.**

---

## 2. Architecture (hexagonal)

### 2.1 Layers and dependency rule

```
domain  ←  application  ←  infrastructure
                 ↑                ↑
               http  ←  composition (wires infrastructure into application)
                 ↑
        pages (Astro routes)  →  ui (components, islands, styles, i18n)
src/worker.ts (custom entrypoint) → fetch: Astro handler | queue: job dispatcher | scheduled: scheduler
```

- `src/domain/` — pure TS: entities, value objects, rules (pricing, tax, stock, order status, invoice numbering). Imports nothing outside `src/domain`.
- `src/application/` — use cases (classes with `execute()`), **ports**, DTOs, zod schemas, job definitions/handlers, notification templates,
  content defaults and pure **document builders** (email layout, invoice HTML, CSV). Imports only `domain` (+ `zod`, `micromark`).
- `src/infrastructure/` — adapters: D1, R2, KV, Queues, dLocal Go, PayPal, Email, Browser Run, Meta (Graph API: CAPI + WhatsApp), Analytics Engine,
  Turnstile, Rate limit, Google Places, Workers AI, Cloudflare env.
- `src/composition/` — the only place that instantiates adapters and use cases (`createApp(env, ctx)`).
- `src/http/` — driving-adapter helpers (endpoint factory, error mapping, cookies, auth guard, page cache, middleware).
- `src/ui/` — Astro components, Preact islands, layouts, scripts, styles, i18n, client stores. Never imports `infrastructure`/`composition`.
- `src/pages/` — thin Astro routes calling `Astro.locals.app.*`.
- `src/worker.ts` — custom Worker entrypoint (Stage 1).
- `clients/<slug>/` — per-client deployment config + optional code extensions.

ESLint `no-restricted-imports` enforces the rule (Stage 0).

### 2.2 Folder tree (target)

```
.
├─ CLAUDE.md  README.md  astro.config.mjs  .dev.vars.example
├─ wrangler.base.jsonc               # shared Worker config (placeholders, no ids)
├─ wrangler.jsonc                    # GENERATED for the active client (gitignored)
├─ worker-configuration.d.ts         # generated by `wrangler types`
├─ clients/ _default/extensions/index.ts, demo/{client.jsonc, extensions/index.ts}
├─ scripts/ use-client.mjs new-client.mjs deploy-client.mjs deploy-all.mjs client-secrets.mjs
├─ .secrets/                         # gitignored per-client secrets
├─ db/ migrations/0001_initial.sql, seed/dev.sql
├─ docs/ IMPLEMENTATION_PLAN.md PROGRESS.md ARCHITECTURE.md DECISIONS.md CUSTOMIZATION.md NEW_CLIENT.md
│        SECURITY.md JOBS.md ANALYTICS.md WHATSAPP.md
├─ public/ favicon.svg, images/placeholder.svg
└─ src/
   ├─ worker.ts  env.d.ts  middleware.ts
   ├─ domain/
   │  ├─ shared/     locale, localized-text, money, currency, errors, slug, pagination, format, paths, phone, color
   │  ├─ catalog/    product, variant, category, attribute, pricing, catalog-query (filter model + normalize)
   │  ├─ inventory/  stock (movement reasons, threshold crossing rules)
   │  ├─ ordering/   order, order-status, cart-line, shipping, payment-method, tax, totals
   │  ├─ invoicing/  invoice
   │  ├─ content/    page, widget, settings, testimonial
   │  ├─ identity/   admin-user, role
   │  └─ media/      media-asset
   ├─ application/
   │  ├─ ports/      catalog, inventory, ordering, payments, invoicing, notifications, whatsapp, marketing,
   │  │              analytics, reports, jobs, content, identity, media, platform
   │  ├─ forms/      field-descriptor, fields-to-schema
   │  ├─ documents/  html, email-layout, blocks, invoice-document, html-to-text, csv, urls
   │  ├─ jobs/       job-types (zod per type), registry (type → handler), dispatch, backoff, scheduler
   │  ├─ catalog/  inventory/  ordering/  invoicing/  content/  identity/  media/  marketing/  reports/
   │  └─ notifications/ template-engine, notification-service, email/ (one definition per key),
   │                    whatsapp/ (one definition per key), use cases (preview, save, restore, test, sync…)
   ├─ infrastructure/
   │  ├─ cloudflare/ env.ts
   │  ├─ d1/         d1-client, mappers, *-repository, catalog-query-service, reports-query-service
   │  ├─ r2/  kv/  queues/ (cloudflare-job-queue, inline-job-queue)
   │  ├─ payments/   dlocalgo-*, paypal-*, manual-gateways
   │  ├─ email/      cloudflare-email-sender, console-email-sender
   │  ├─ meta/       graph-client, meta-conversions-sink, whatsapp-cloud-sender, whatsapp-template-catalog, meta-signature
   │  ├─ analytics/  analytics-engine-sink, analytics-sql-query-service
   │  ├─ invoicing/  browser-run-pdf-renderer, null-pdf-renderer, noop-legal-invoice-issuer
   │  ├─ security/   pbkdf2-password-hasher, turnstile-verifier, cloudflare-rate-limiter
   │  ├─ google/     places-reviews-provider
   │  ├─ ai/         workers-ai-translator (optional)
   │  └─ system/     system-clock, crypto-id-generator, web-crypto-hasher
   ├─ composition/   create-app.ts
   ├─ http/          define-endpoint, errors, cookies, request-info, log, middleware/*
   ├─ ui/
   │  ├─ styles/ i18n/ stores/ scripts/
   │  ├─ lib/        format, media-url, theme-css, markdown, whatsapp, routes, seo, track
   │  ├─ components/ primitives + charts/ (LineChart, BarChart, Sparkline — SVG, no library)
   │  ├─ layouts/  store/  widgets/
   │  └─ admin/      lib/api-client, ListToolbar, DateRangePicker, SchemaForm, ProductEditor, VariantMatrix,
   │                 MediaLibrary, MediaPicker, InventoryTable, StockAdjustDrawer, CsvImport, BarcodeScanner,
   │                 PageBuilder, OrderDetail, InvoiceDetail, EmailTemplateEditor, WhatsAppTemplatesManager,
   │                 ReportView, FailedJobsTable, DataTable, StickySaveBar, ConfirmDialog, StatusBadge
   └─ pages/
      ├─ index.ts robots.txt.ts sitemap.xml.ts media/[...key].ts feeds/products.xml.ts
      ├─ [locale]/   index, shop/index, shop/[category], products/[slug], cart, checkout/{index,success,paypal-return,cancel},
      │              orders/[number], orders/[number]/invoice, about, contact, privacy, terms, shipping-returns, p/[slug]
      ├─ admin/      setup login forgot-password reset-password index products/* categories attributes media
      │              inventory/{index,movements} orders/* invoices/* messages pages/* testimonials shipping
      │              emails/* whatsapp reports/[report] notification-log jobs settings/[group] users
      └─ api/        health cart/quote catalog/count search/suggest checkout contact events stock-subscriptions
                     orders/[number]/invoice.pdf webhooks/{dlocalgo,paypal,whatsapp} admin/** (JSON + CSV)
```

### 2.3 Multi-client model (all clients in our account)

- `wrangler.base.jsonc` = everything shared; `clients/<slug>/client.jsonc` = what differs:
  ```jsonc
  {
    "slug": "demo",
    "workerName": "demo-store",
    "accountId": null,                         // null = our account; set for clients with their own account
    "d1": { "name": "demo-db", "id": "<id>" },
    "r2": { "bucket": "demo-media" },
    "kv": { "id": "<id>" },
    "queue": { "name": "demo-jobs", "dlq": "demo-jobs-dlq" },
    "analyticsDataset": "demo_events",
    "rateLimitNamespaceBase": 1000,            // RL_AUTH = base+1, RL_FORMS = base+2, RL_API = base+3
    "cron": "*/15 * * * *",                    // exactly one cron expression per client
    "customDomains": ["shop.example.com"],
    "vars": { "PUBLIC_SITE_URL": "https://shop.example.com", "EMAIL_FROM": "Shop <orders@example.com>",
              "PAYPAL_ENV": "live", "TURNSTILE_SITE_KEY": "<key>", "PUBLIC_MEDIA_BASE_URL": "",
              "CLIENT_SLUG": "demo", "WHATSAPP_PHONE_NUMBER_ID": "", "WHATSAPP_WABA_ID": "", "META_GRAPH_VERSION": "<current>" }
  }
  ```
- `scripts/use-client.mjs [slug]` (default `process.env.CLIENT_SLUG || "demo"`) merges base + client into root `wrangler.jsonc`
  (gitignored). `predev`, `prebuild`, `precf-typegen` call it.
- `@client` Vite alias → `clients/<slug>/extensions` (fallback `_default`): extra widgets (definition + renderer) and CSS per client.
- `deploy-client.mjs <slug>`: use-client → build → `wrangler queues create` if missing (idempotent) → D1 migrations remote → `wrangler deploy`.
  With `accountId`, loads `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` from `.secrets/<slug>.env`.
- `deploy-all.mjs`: all clients sequentially, summary table, non-zero exit if any failed.
- `new-client.mjs <slug>`: creates D1, R2, KV, queues, allocates `rateLimitNamespaceBase` (+10 steps), writes `client.jsonc`.
- `client-secrets.mjs <slug>`: `.secrets/<slug>.json` → `wrangler secret bulk`.

---

## 3. Conventions (summarize in `CLAUDE.md`)

**Language & docs** — English everywhere. Every file starts with a 1–3 line header comment. Every exported symbol has JSDoc.
Comment the *why*, not the obvious.

**TypeScript** — `strict`, `noUncheckedIndexedAccess`, no `any`. Alias `@/*` → `src/*`. Files `kebab-case.ts`; components
`PascalCase.astro|tsx`; DB `snake_case`. Use cases = verb classes with `deps` constructor + `execute(input)`. zod schemas in
`application/**/schemas.ts`, reused by endpoints (never redeclare shapes).

**Data** — Money in integer minor units (`*_minor`). Tax rates in basis points (`1900` = 19%). IDs `crypto.randomUUID()`.
Timestamps ISO UTC from the `Clock` port. Translatable entities needing per-locale slug/search → `*_translations` tables;
short texts → `LocalizedText` JSON. D1 booleans `0/1`. Orders/items/invoices store snapshots. **Every stock change writes an
`inventory_movements` row in the same D1 batch** (no stock update anywhere else).

**Side effects** — Anything slow, external or retryable (emails, WhatsApp, PDFs, Meta CAPI, legal invoices, alerts) is a
**job** enqueued through the `JobQueue` port, never awaited inside a user request.

**Errors** — `DomainError(code, message, details?)`; `http/errors.ts` maps to HTTP; UI shows `t(locale, "errors." + code)`.
Job handlers throw `RetryableError` (temporary) or `DomainError` (permanent).

**UI** — Mobile-first (design at 360px). Touch targets ≥ 44px. Zero JS by default; islands `client:visible`/`client:idle`.
All strings from i18n. CSS-only animations honoring `prefers-reduced-motion`. Before creating any helper/component,
search `src/` — shared logic lives in exactly one module.

**Approved dependencies** (others need a reason in `docs/DECISIONS.md`): `astro`, `@astrojs/cloudflare`, `@astrojs/preact`, `preact`,
`tailwindcss`, `@tailwindcss/vite`, `zod`, `nanostores`, `@nanostores/persistent`, `@nanostores/preact`, `micromark`,
`@fontsource-variable/inter`, `@fontsource-variable/manrope`, `@fontsource-variable/playfair-display`;
dev: `wrangler` (≥ 4.145), `typescript`, `@astrojs/check`, `eslint`, `typescript-eslint`, `eslint-plugin-astro`, `globals`,
`prettier`, `prettier-plugin-astro`, `prettier-plugin-tailwindcss`, `jsonc-parser` (scripts only).

---

## 4. Rules for the implementing agent (Haiku)

1. Execute stages **in order**; a stage starts only after the previous "Done when" passes.
2. After every numbered step run `npm run check`; fix everything before continuing.
3. End of stage: `npm run check && npm run build`, manual smoke steps, tick `docs/PROGRESS.md`, commit `feat(stage-N): <summary>`, `git push`.
4. If an external API (Astro adapter, Cloudflare, dLocal Go, PayPal, Meta) differs from this plan, read the official docs,
   adapt **only inside the adapter file** that wraps it, and log it in `docs/DECISIONS.md`.
5. Never put secrets in code, `clients/*.jsonc` or D1. Secrets: `.dev.vars` (local), `.secrets/` → `wrangler secret bulk` (prod).
6. Never edit generated files (`wrangler.jsonc`, `worker-configuration.d.ts`, `.astro/`).
7. Stop and ask the user for anything requiring them (Cloudflare login, dLocal Go/PayPal/Meta accounts, domains, DNS, template approval).
8. Keep files < ~250 lines; split by responsibility.

---

## 5. Data model — `db/migrations/0001_initial.sql`

Write exactly this (plus a short comment above each table):

```sql
-- Settings (one row per group; value validated by zod)
CREATE TABLE settings (group_key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);

-- Identity
CREATE TABLE admin_users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','editor')), locale TEXT NOT NULL DEFAULT 'es', phone TEXT,
  is_active INTEGER NOT NULL DEFAULT 1, last_login_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL, ip TEXT, user_agent TEXT
);
CREATE INDEX idx_admin_sessions_user ON admin_sessions(user_id);
CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, used_at TEXT
);

-- Media (files in R2; variants_json = [{"width":480,"key":"media/<id>/480.webp","bytes":12345}])
CREATE TABLE media_assets (
  id TEXT PRIMARY KEY, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
  variants_json TEXT NOT NULL, alt_json TEXT NOT NULL DEFAULT '{}', bytes_total INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_media_created ON media_assets(created_at DESC);

-- Catalog
CREATE TABLE categories (
  id TEXT PRIMARY KEY, parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  image_media_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL, position INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE category_translations (
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE, locale TEXT NOT NULL, name TEXT NOT NULL,
  slug TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', PRIMARY KEY (category_id, locale), UNIQUE (locale, slug)
);
CREATE TABLE attributes (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name_json TEXT NOT NULL,
  display TEXT NOT NULL DEFAULT 'buttons' CHECK (display IN ('buttons','swatches')),
  is_filterable INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE attribute_values (
  id TEXT PRIMARY KEY, attribute_id TEXT NOT NULL REFERENCES attributes(id) ON DELETE CASCADE, code TEXT NOT NULL,
  label_json TEXT NOT NULL, color_hex TEXT, position INTEGER NOT NULL DEFAULT 0, UNIQUE (attribute_id, code)
);
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  base_price_minor INTEGER NOT NULL CHECK (base_price_minor >= 0),
  compare_at_price_minor INTEGER CHECK (compare_at_price_minor IS NULL OR compare_at_price_minor >= 0),
  tax_rate_bp INTEGER CHECK (tax_rate_bp IS NULL OR tax_rate_bp BETWEEN 0 AND 10000),   -- NULL = store default
  min_price_minor INTEGER NOT NULL, max_price_minor INTEGER NOT NULL,                  -- denormalized on save
  is_on_sale INTEGER NOT NULL DEFAULT 0,                                               -- denormalized: any variant below compare-at
  is_featured INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_products_listing ON products(status, created_at DESC);
CREATE INDEX idx_products_price ON products(status, min_price_minor);
CREATE INDEX idx_products_featured ON products(status, is_featured);
CREATE TABLE product_translations (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, locale TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL,
  short_description TEXT NOT NULL DEFAULT '', description_md TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '', seo_description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (product_id, locale), UNIQUE (locale, slug)
);
CREATE TABLE product_categories (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE, PRIMARY KEY (product_id, category_id)
);
CREATE INDEX idx_product_categories_category ON product_categories(category_id);
CREATE TABLE product_images (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE, position INTEGER NOT NULL,
  PRIMARY KEY (product_id, media_id)
);
CREATE TABLE product_variants (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT UNIQUE, barcode TEXT,
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),   -- NULL = product base price
  compare_at_price_minor INTEGER,
  cost_minor INTEGER CHECK (cost_minor IS NULL OR cost_minor >= 0),      -- purchase cost (margins, valuation)
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),                   -- CHECK is the oversell guard
  track_inventory INTEGER NOT NULL DEFAULT 1,
  low_stock_threshold INTEGER,                                           -- NULL = inventory settings default
  image_media_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_barcode ON product_variants(barcode);
CREATE TABLE variant_attribute_values (
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  attribute_value_id TEXT NOT NULL REFERENCES attribute_values(id) ON DELETE RESTRICT,
  PRIMARY KEY (variant_id, attribute_value_id)
);
CREATE INDEX idx_vav_value ON variant_attribute_values(attribute_value_id);
CREATE VIRTUAL TABLE product_search USING fts5(
  product_id UNINDEXED, locale UNINDEXED, name, short_description, tokenize = 'unicode61 remove_diacritics 2'
);

-- Inventory
CREATE TABLE inventory_movements (                     -- append-only stock ledger
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('initial','sale','cancel_restore','restock','manual_adjust','return','damage','import')),
  reference TEXT,                                      -- order id / import batch id
  note TEXT,
  actor TEXT NOT NULL,                                 -- admin user id | 'system' | 'customer'
  created_at TEXT NOT NULL
);
CREATE INDEX idx_inv_mov_variant ON inventory_movements(variant_id, created_at DESC);
CREATE INDEX idx_inv_mov_created ON inventory_movements(created_at DESC);
CREATE TABLE stock_subscriptions (                     -- "notify me when back in stock"
  id TEXT PRIMARY KEY, variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  email TEXT NOT NULL, phone TEXT, locale TEXT NOT NULL, whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, notified_at TEXT, UNIQUE (variant_id, email)
);

-- Shipping
CREATE TABLE shipping_methods (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('flat','pickup')), name_json TEXT NOT NULL,
  description_json TEXT NOT NULL DEFAULT '{}', price_minor INTEGER NOT NULL DEFAULT 0, free_over_minor INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL DEFAULT 0
);

-- Orders
CREATE TABLE order_counter (id INTEGER PRIMARY KEY CHECK (id = 1), last_number INTEGER NOT NULL);
INSERT INTO order_counter (id, last_number) VALUES (1, 1000);
CREATE TABLE orders (
  id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE,
  access_key_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_payment','paid','processing','shipped','delivered','cancelled','refunded')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('dlocalgo','paypal','whatsapp','bank_transfer','cash_on_delivery')),
  payment_reference TEXT, currency TEXT NOT NULL, locale TEXT NOT NULL, prices_include_tax INTEGER NOT NULL,
  subtotal_minor INTEGER NOT NULL, tax_minor INTEGER NOT NULL, shipping_minor INTEGER NOT NULL, total_minor INTEGER NOT NULL,
  customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, customer_phone TEXT NOT NULL,
  whatsapp_opt_in INTEGER NOT NULL DEFAULT 0, marketing_consent INTEGER NOT NULL DEFAULT 0,
  billing_json TEXT NOT NULL DEFAULT '{}', shipping_method_id TEXT, shipping_method_name TEXT NOT NULL,
  shipping_address_json TEXT NOT NULL DEFAULT '{}', customer_note TEXT NOT NULL DEFAULT '', tracking_code TEXT,
  attribution_json TEXT NOT NULL DEFAULT '{}',          -- utm_source/medium/campaign, referrer host, fbclid/fbc
  stock_released INTEGER NOT NULL DEFAULT 0, expires_at TEXT, paid_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX idx_orders_payment_ref ON orders(payment_method, payment_reference);
CREATE INDEX idx_orders_expiry ON orders(status, expires_at);
CREATE INDEX idx_orders_email ON orders(customer_email);
CREATE TABLE order_items (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL, variant_id TEXT NOT NULL, product_name TEXT NOT NULL, variant_label TEXT NOT NULL DEFAULT '',
  sku TEXT, image_media_id TEXT, unit_price_minor INTEGER NOT NULL, unit_cost_minor INTEGER,
  quantity INTEGER NOT NULL CHECK (quantity > 0), line_total_minor INTEGER NOT NULL,
  tax_rate_bp INTEGER NOT NULL, tax_minor INTEGER NOT NULL, stock_tracked INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
CREATE TABLE order_events (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE, type TEXT NOT NULL,
  note TEXT, actor TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_order_events_order ON order_events(order_id, created_at);
CREATE TABLE payment_events (provider TEXT NOT NULL, event_id TEXT NOT NULL, received_at TEXT NOT NULL, PRIMARY KEY (provider, event_id));

-- Invoicing
CREATE TABLE invoice_counters (series TEXT PRIMARY KEY, last_number INTEGER NOT NULL);
CREATE TABLE invoices (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES orders(id), series TEXT NOT NULL, number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('issued','void')), currency TEXT NOT NULL, locale TEXT NOT NULL,
  prices_include_tax INTEGER NOT NULL, subtotal_minor INTEGER NOT NULL, tax_minor INTEGER NOT NULL,
  shipping_minor INTEGER NOT NULL, total_minor INTEGER NOT NULL,
  seller_json TEXT NOT NULL, buyer_json TEXT NOT NULL, lines_json TEXT NOT NULL, tax_breakdown_json TEXT NOT NULL,
  pdf_key TEXT, legal_provider TEXT, legal_reference TEXT,
  legal_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK (legal_status IN ('not_applicable','pending','accepted','rejected')),
  legal_message TEXT, void_reason TEXT, issued_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (series, number)
);
CREATE INDEX idx_invoices_issued ON invoices(issued_at DESC);

-- Notifications
CREATE TABLE email_templates (                         -- admin overrides; missing row = code default
  key TEXT PRIMARY KEY, subject_json TEXT NOT NULL, body_json TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE whatsapp_templates (                      -- mapping of our notification keys to Meta-approved templates
  key TEXT PRIMARY KEY, meta_name TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 0,
  body_json TEXT NOT NULL,                             -- LocalizedText with {{1}}..{{n}} exactly as submitted to Meta
  params_json TEXT NOT NULL,                           -- ordered context paths for {{1}}..{{n}}
  button_param_path TEXT, header_document INTEGER NOT NULL DEFAULT 0,
  remote_status_json TEXT NOT NULL DEFAULT '{}',       -- {"es":"APPROVED","en":"PENDING"}
  updated_at TEXT NOT NULL
);
CREATE TABLE notification_log (
  id TEXT PRIMARY KEY, channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp')), template_key TEXT NOT NULL,
  recipient TEXT NOT NULL, subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','delivered','read','failed','skipped')),
  provider_message_id TEXT, error TEXT, order_id TEXT, idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_notification_log_created ON notification_log(created_at DESC);
CREATE INDEX idx_notification_log_order ON notification_log(order_id);
CREATE INDEX idx_notification_log_provider ON notification_log(provider_message_id);

-- Jobs and analytics
CREATE TABLE failed_jobs (                             -- written by the dead-letter consumer
  id TEXT PRIMARY KEY, job_type TEXT NOT NULL, payload_json TEXT NOT NULL, error TEXT, attempts INTEGER NOT NULL,
  created_at TEXT NOT NULL, resolved_at TEXT, resolution TEXT CHECK (resolution IN ('retried','discarded'))
);
CREATE INDEX idx_failed_jobs_created ON failed_jobs(created_at DESC);
CREATE TABLE daily_metrics (                           -- nightly rollup from Analytics Engine + D1 (kept forever)
  day TEXT PRIMARY KEY, page_views INTEGER NOT NULL DEFAULT 0, product_views INTEGER NOT NULL DEFAULT 0,
  add_to_carts INTEGER NOT NULL DEFAULT 0, checkouts_started INTEGER NOT NULL DEFAULT 0,
  orders_placed INTEGER NOT NULL DEFAULT 0, orders_paid INTEGER NOT NULL DEFAULT 0, revenue_minor INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Content
CREATE TABLE pages (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK (kind IN ('system','custom')),
  title_json TEXT NOT NULL, seo_title_json TEXT NOT NULL DEFAULT '{}', seo_description_json TEXT NOT NULL DEFAULT '{}',
  sections_json TEXT NOT NULL DEFAULT '[]', is_published INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE testimonials (
  id TEXT PRIMARY KEY, author_name TEXT NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), body TEXT NOT NULL,
  locale TEXT NOT NULL, avatar_media_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  is_visible INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE contact_messages (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, message TEXT NOT NULL, locale TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX idx_contact_messages_created ON contact_messages(created_at DESC);
```

Simple products have **one default variant with no attribute values**; cart, orders and inventory always reference `variant_id`.

---

## 6. Core contracts (write signatures first; implement in stages)

```ts
// ---------- domain/shared ----------
export const SUPPORTED_LOCALES = ["es", "en"] as const;  export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type LocalizedText = Record<Locale, string>;
export function pickText(text: Partial<LocalizedText> | undefined, locale: Locale, fallback: Locale): string;
export interface Money { readonly amountMinor: number; readonly currency: CurrencyCode }
export const CURRENCIES = { USD: { exponent: 2 }, EUR: { exponent: 2 }, COP: { exponent: 2, displayDecimals: 0 },
  MXN: { exponent: 2 }, PEN: { exponent: 2 }, CLP: { exponent: 0 }, ARS: { exponent: 2 } } as const;
export type ErrorCode = "NOT_FOUND" | "VALIDATION_FAILED" | "OUT_OF_STOCK" | "PRODUCT_UNAVAILABLE" | "PAYMENT_METHOD_UNAVAILABLE"
  | "PAYMENT_PROVIDER_ERROR" | "UNAUTHORIZED" | "FORBIDDEN" | "RATE_LIMITED" | "BOT_CHECK_FAILED" | "CONFLICT" | "INVALID_STATE";
export class DomainError extends Error { constructor(readonly code: ErrorCode, message: string, readonly details?: unknown) }
export class RetryableError extends Error { constructor(message: string, readonly retryAfterSeconds?: number) }
export function normalizePhone(raw: string, defaultCountryCode: string): string | null;   // → digits E.164 without "+"

// ---------- domain/ordering/tax.ts + totals.ts ----------
export function computeLineTax(amountMinor: number, rateBp: number, pricesIncludeTax: boolean): { netMinor: number; taxMinor: number; grossMinor: number };
// included: tax = round(amount * rate / (10000 + rate)); excluded: tax = round(amount * rate / 10000). Round half up, integers only.
export function computeOrderTotals(lines: TotalsLine[], shipping: ShippingQuote | null, tax: TaxSettings): OrderTotals; // used by quote, checkout, gateways, invoices

// ---------- domain/catalog/catalog-query.ts ----------
export interface CatalogQuery {
  locale: Locale; q: string | null; categorySlug: string | null; valueIds: string[];  // attribute value ids
  minPriceMinor: number | null; maxPriceMinor: number | null; inStock: boolean; onSale: boolean; isNew: boolean;
  sort: "relevance" | "newest" | "price_asc" | "price_desc" | "best_sellers" | "featured"; page: number;
}
/** Parses + normalizes URL params (dedupe, sort value ids, clamp page, swap min/max) — ONE implementation used by pages, count API and canonical redirects. */
export function parseCatalogQuery(params: URLSearchParams, locale: Locale): CatalogQuery;
export function catalogQueryToSearchParams(q: CatalogQuery): URLSearchParams;            // canonical order
export function isIndexableCatalogQuery(q: CatalogQuery): boolean;                       // false when any filter/sort/search is set

// ---------- domain/inventory/stock.ts ----------
export type StockReason = "initial" | "sale" | "cancel_restore" | "restock" | "manual_adjust" | "return" | "damage" | "import";
export function crossedLowStock(before: number, after: number, threshold: number): boolean;   // before > t && after <= t
export function cameBackInStock(before: number, after: number): boolean;                      // before <= 0 && after > 0

// ---------- application/ports/platform.ts ----------
export interface Clock { now(): Date }
export interface IdGenerator { newId(): string; newSecret(bytes?: number): string }
export interface Hasher { sha256Hex(value: string): Promise<string> }
export interface CacheStore { getJson<T>(key: string): Promise<T | null>; putJson(key: string, value: unknown, ttlSeconds?: number): Promise<void>; delete(key: string): Promise<void> }
export interface PageCacheVersion { current(): Promise<string>; bump(): Promise<void> }
export interface BotVerifier { verify(token: string | null, ip: string | null): Promise<boolean> }
export type RateLimitBucket = "auth" | "forms" | "api";
export interface RateLimiter { allow(bucket: RateLimitBucket, key: string): Promise<boolean> }
export interface EmailAttachment { filename: string; contentType: string; content: ArrayBuffer }
export interface EmailSender { send(msg: { to: string; subject: string; html: string; text: string; replyTo?: string; attachments?: EmailAttachment[] }): Promise<{ messageId: string }> }

// ---------- application/ports/jobs.ts ----------
export type JobType =
  | "notify.email" | "notify.whatsapp" | "invoice.render_pdf" | "invoice.legal_issue" | "marketing.meta_capi"
  | "inventory.low_stock_alert" | "inventory.back_in_stock" | "orders.expire_stale" | "reviews.refresh"
  | "reports.weekly_summary" | "analytics.daily_rollup" | "maintenance.purge";
export interface JobEnvelope<T extends JobType = JobType> { id: string; type: T; payload: JobPayloads[T]; idempotencyKey: string; createdAt: string }
export interface JobQueue {
  enqueue<T extends JobType>(type: T, payload: JobPayloads[T], opts?: { delaySeconds?: number; idempotencyKey?: string }): Promise<void>;
  enqueueMany(jobs: { type: JobType; payload: unknown; delaySeconds?: number; idempotencyKey?: string }[]): Promise<void>;
}
export interface FailedJobRepository { record(envelope: JobEnvelope, error: string, attempts: number): Promise<void>; list(q: PageQuery): Promise<Paginated<FailedJob>>; resolve(id: string, resolution: "retried" | "discarded"): Promise<void> }

// ---------- application/ports/payments.ts ----------
export type PaymentMethod = "dlocalgo" | "paypal" | "whatsapp" | "bank_transfer" | "cash_on_delivery";
export type PaymentInitiation = { kind: "redirect"; url: string; providerReference?: string } | { kind: "confirmation" };
export interface PaymentGateway {
  readonly method: PaymentMethod;
  isConfigured(settings: CheckoutSettings, contact: ContactSettings): boolean;
  supportsCurrency(currency: CurrencyCode, settings: CheckoutSettings): boolean;
  initiate(input: { order: OrderSummaryDto; accessKey: string; origin: string }): Promise<PaymentInitiation>;
}
export interface PaymentConfirmation { provider: "dlocalgo" | "paypal"; eventId: string; providerReference: string; outcome: "succeeded" | "failed" | "expired" | "refunded"; amountMinor: number; currency: string }

// ---------- application/ports/catalog.ts & inventory.ts ----------
export interface CatalogQueryService {
  listProducts(q: CatalogQuery, pageSize: number): Promise<Paginated<ProductCardDto>>;
  countProducts(q: CatalogQuery): Promise<number>;
  getFacets(q: CatalogQuery): Promise<FacetsDto>;   // disjunctive counts: each facet ignores its own selection
  getProductBySlug(locale: Locale, slug: string): Promise<ProductDetailDto | null>;
  listCategories(locale: Locale): Promise<CategoryDto[]>; getCategoryBySlug(locale: Locale, slug: string): Promise<CategoryDto | null>;
  suggest(locale: Locale, term: string, limit: number): Promise<SearchSuggestionDto[]>;
  getQuoteVariants(variantIds: string[], locale: Locale): Promise<QuoteVariantDto[]>;
  listProductsByIds(locale: Locale, ids: string[]): Promise<ProductCardDto[]>;
  listForFeed(locale: Locale): Promise<FeedItemDto[]>;
}
export interface ProductRepository { findById(id: string): Promise<Product | null>; save(p: Product, actor: string): Promise<StockChange[]>; delete(id: string): Promise<void>; listForAdmin(q: AdminProductQuery): Promise<Paginated<AdminProductRowDto>> }
export interface InventoryRepository {
  /** Applies deltas + ledger rows in ONE batch; returns before/after per variant. Throws OUT_OF_STOCK on negative stock. */
  adjust(changes: { variantId: string; delta: number; reason: StockReason; reference?: string; note?: string }[], actor: string): Promise<StockChange[]>;
  findVariantByCode(code: string): Promise<InventoryRowDto | null>;          // SKU or barcode
  list(q: InventoryQuery): Promise<Paginated<InventoryRowDto>>;
  listMovements(q: MovementQuery): Promise<Paginated<MovementDto>>;
  addSubscription(s: NewStockSubscription): Promise<void>;
  listPendingSubscriptions(variantId: string): Promise<StockSubscription[]>;
  markSubscriptionsNotified(ids: string[], nowIso: string): Promise<void>;
}
export interface StockChange { variantId: string; productId: string; before: number; after: number; threshold: number }

// ---------- application/ports/ordering.ts ----------
export interface OrderRepository {
  place(draft: NewOrder): Promise<{ id: string; number: number; stockChanges: StockChange[] }>;  // stock + ledger + order in one batch
  findById(id: string): Promise<Order | null>; findByNumber(n: number): Promise<Order | null>;
  findByPaymentReference(method: PaymentMethod, ref: string): Promise<Order | null>;
  setPaymentReference(id: string, ref: string): Promise<void>;
  transition(id: string, to: OrderStatus, event: NewOrderEvent, patch?: Partial<OrderPatch>): Promise<void>;
  cancelAndReleaseStock(id: string, event: NewOrderEvent): Promise<StockChange[]>;   // idempotent via stock_released
  listExpiredPending(nowIso: string, limit: number): Promise<string[]>;
  listForAdmin(q: AdminOrderQuery): Promise<Paginated<AdminOrderRowDto>>;
}
export interface PaymentEventLog { recordIfNew(provider: string, eventId: string): Promise<boolean> }

// ---------- application/ports/invoicing.ts ----------
export interface InvoiceRepository { issue(draft: NewInvoice): Promise<Invoice>; findById(id: string): Promise<Invoice | null>; findByOrderId(id: string): Promise<Invoice | null>; setPdfKey(id: string, key: string): Promise<void>; setLegalResult(id: string, r: LegalResult): Promise<void>; void(id: string, reason: string, nowIso: string): Promise<void>; listForAdmin(q: AdminInvoiceQuery): Promise<Paginated<AdminInvoiceRowDto>> }
export interface PdfRenderer { readonly available: boolean; render(html: string): Promise<ArrayBuffer> }
export interface LegalInvoiceIssuer { readonly provider: string; isEnabled(): boolean; issue(invoice: Invoice): Promise<LegalResult> }

// ---------- application/ports/notifications.ts & whatsapp.ts ----------
export type NotificationKey = "order_received" | "order_alert_store" | "payment_confirmed" | "order_processing" | "order_shipped"
  | "order_delivered" | "order_cancelled" | "order_refunded" | "invoice_issued" | "contact_message_store" | "contact_autoreply"
  | "low_stock_store" | "back_in_stock" | "weekly_report_store" | "admin_password_reset" | "admin_invite";
export interface NotificationRecipient { email?: string; phone?: string; locale: Locale; whatsappOptIn: boolean }
export interface EmailTemplateRepository { find(key: NotificationKey): Promise<EmailTemplateOverride | null>; list(): Promise<EmailTemplateOverride[]>; save(o: EmailTemplateOverride): Promise<void>; delete(key: NotificationKey): Promise<void> }
export interface WhatsAppTemplateRepository { find(key: NotificationKey): Promise<WhatsAppTemplateConfig | null>; list(): Promise<WhatsAppTemplateConfig[]>; save(c: WhatsAppTemplateConfig): Promise<void> }
export interface NotificationLogRepository { createQueued(e: NewLogEntry): Promise<{ id: string; duplicate: boolean }>; markSent(id: string, providerMessageId: string): Promise<void>; markFailed(id: string, error: string): Promise<void>; markSkipped(id: string, reason: string): Promise<void>; updateByProviderId(providerMessageId: string, status: "delivered" | "read" | "failed", error?: string): Promise<void>; list(q: LogQuery): Promise<Paginated<LogEntryDto>> }
export interface WhatsAppSender {
  isConfigured(): boolean;
  sendTemplate(msg: { to: string; templateName: string; languageCode: string; bodyParams: string[]; buttonUrlParam?: string;
    document?: { bytes: ArrayBuffer; filename: string } }): Promise<{ messageId: string }>;
}
export interface WhatsAppTemplateCatalog { listRemote(): Promise<RemoteTemplateStatus[]>; submit(def: WhatsAppTemplateSubmission): Promise<{ id: string; status: string }> }

// ---------- application/ports/marketing.ts, analytics.ts, reports.ts ----------
export type TrackedEventName = "page_view" | "view_item" | "add_to_cart" | "begin_checkout" | "purchase";
export interface TrackedEvent { id: string; name: TrackedEventName; occurredAt: string; url: string; locale: Locale;
  value?: Money; items?: { productId: string; variantId: string; quantity: number; priceMinor: number }[]; orderId?: string;
  context: { ip: string | null; userAgent: string | null; country: string | null; device: "mobile" | "tablet" | "desktop";
    referrerHost: string | null; utm: Record<string, string>; fbp?: string; fbc?: string; marketingConsent: boolean };
  customer?: { email?: string; phone?: string } }
export interface MarketingEventSink { readonly name: string; isEnabled(): boolean; send(events: TrackedEvent[]): Promise<void> }  // Meta CAPI
export interface AnalyticsWriter { write(event: TrackedEvent): void }                                                           // Analytics Engine, non-blocking
export interface AnalyticsQueryService { funnel(range: DateRange): Promise<FunnelDto>; topViewedProducts(range: DateRange, limit: number): Promise<TopViewedDto[]>; trafficBreakdown(range: DateRange): Promise<TrafficDto>; dailyCounts(day: string, tz: string): Promise<DailyCountsDto> }
export interface ReportsQueryService { /* one method per report in Stage 20, all taking (range: DateRange, tz: string, filters) */ }

// ---------- application/forms ----------
export type FieldDescriptor = /* text|textarea|url|email|tel|color|localizedText|localizedTextarea|localizedMarkdown|number|boolean|
  select|multiselect|image|images|productIds|categoryIds|link|repeater — same as before */;
export function fieldsToSchema(fields: FieldDescriptor[]): z.ZodObject<z.ZodRawShape>;

// ---------- http/define-endpoint.ts ----------
export function defineEndpoint<S extends z.ZodTypeAny, R>(opts: {
  auth: "public" | "admin" | "owner"; rateLimit?: RateLimitBucket; botCheck?: boolean; input?: S;
  invalidatesCache?: boolean;  // default true for admin mutations
  format?: "json" | "csv";     // csv → handler returns { filename, rows } and the helper streams text/csv with UTF-8 BOM
  handler: (ctx: { input: z.infer<S>; app: App; locals: App.Locals; request: Request }) => Promise<R>;
}): APIRoute;

// ---------- composition ----------
export function createApp(env: Env, ctx: ExecutionContextLike | null, request?: Request): App;
```

---

## 7. Stages

### Stage 0 — Repository bootstrap and tooling

Goal: Astro + Cloudflare + Preact + Tailwind project with lint boundaries, docs and first push
(fixes the earlier `src refspec main does not match any` error: the repo had no commits).

1. `npm create astro@latest . -- --template minimal --typescript strict --install --no-git --skip-houston --yes`
   (if the folder is "not empty", scaffold in a sibling temp folder and move the files).
2. `npx astro add cloudflare --yes`, `npx astro add preact --yes`, `npx astro add tailwind --yes`; install the approved deps.
3. `astro.config.mjs`: `output: "server"`, `adapter: cloudflare({ imageService: "passthrough" })`, `integrations: [preact()]`, Tailwind Vite plugin,
   `security: { checkOrigin: true }`, `prefetch: { defaultStrategy: "hover" }`, `build: { inlineStylesheets: "auto" }`,
   alias `@client` → `clients/<CLIENT_SLUG|demo>/extensions` (fallback `_default`). No Astro i18n routing.
4. `tsconfig.json`: strict + `noUncheckedIndexedAccess` + paths `@/*`, `@client`; include `worker-configuration.d.ts`.
5. `eslint.config.js` with `no-restricted-imports` per layer:
   domain ✗ application/infrastructure/http/ui/composition/astro*/cloudflare:*/preact*/zod;
   application ✗ infrastructure/http/ui/composition/astro*/cloudflare:*/preact*;
   infrastructure ✗ http/ui/composition; ui, pages, clients ✗ infrastructure.
6. Prettier (`prettier-plugin-astro`, `prettier-plugin-tailwindcss`, printWidth 110), `.editorconfig`,
   `.gitignore` (`node_modules dist .astro .wrangler .dev.vars .env* .secrets/ /wrangler.jsonc`).
7. Scripts: `predev`/`prebuild`/`precf-typegen` = `node scripts/use-client.mjs`; `dev`, `build`, `preview` (`npm run build && wrangler dev`),
   `check` (`astro check && eslint . && prettier --check .`), `format`, `cf-typegen`, `db:migrate:local`, `db:seed:local`,
   `client:new`, `client:secrets`, `deploy:client`, `deploy:all`.
8. Docs: `docs/IMPLEMENTATION_PLAN.md` (this plan), `PROGRESS.md` (checkbox per stage), `DECISIONS.md`, `ARCHITECTURE.md`; `CLAUDE.md`
   (sections 3 + 4 + "read docs/IMPLEMENTATION_PLAN.md and docs/PROGRESS.md first").
9. Temporary `src/pages/index.ts` returning `new Response("ok")`.

Done when: check/build pass; first commit; `git push -u origin main` succeeds.

### Stage 1 — Cloudflare resources, bindings, per-client config, custom entrypoint

1. If `npx wrangler whoami` fails, ask the user to run `npx wrangler login`.
2. `wrangler.base.jsonc` (keep adapter-generated `assets`/`compatibility_flags` with `nodejs_compat`; `compatibility_date` = today, ≥ 2026-03-24):
   ```jsonc
   "main": "./src/worker.ts",
   "observability": { "enabled": true },
   "d1_databases": [{ "binding": "DB", "database_name": "__D1_NAME__", "database_id": "__D1_ID__", "migrations_dir": "db/migrations" }],
   "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "__R2_BUCKET__" }],
   "kv_namespaces": [{ "binding": "CACHE", "id": "__KV_ID__" }],
   "queues": {
     "producers": [{ "binding": "JOBS", "queue": "__QUEUE__" }],
     "consumers": [
       { "queue": "__QUEUE__", "max_batch_size": 10, "max_batch_timeout": 5, "max_retries": 5, "retry_delay": 30,
         "max_concurrency": 5, "dead_letter_queue": "__DLQ__" },
       { "queue": "__DLQ__", "max_batch_size": 10, "max_retries": 1 }
     ]
   },
   "triggers": { "crons": ["__CRON__"] },
   "send_email": [{ "name": "EMAIL" }],
   "browser": { "binding": "BROWSER", "remote": true },
   "analytics_engine_datasets": [{ "binding": "EVENTS", "dataset": "__AE_DATASET__" }],
   "analytics": { "binding": "ANALYTICS_SQL", "remote": true },
   "ratelimits": [
     { "name": "RL_AUTH",  "namespace_id": "__RL_AUTH__",  "simple": { "limit": 5,  "period": 60 } },
     { "name": "RL_FORMS", "namespace_id": "__RL_FORMS__", "simple": { "limit": 10, "period": 60 } },
     { "name": "RL_API",   "namespace_id": "__RL_API__",   "simple": { "limit": 60, "period": 10 } }
   ],
   "vars": { "PUBLIC_SITE_URL": "http://localhost:4321", "EMAIL_FROM": "Store <orders@example.com>", "PAYPAL_ENV": "sandbox",
             "TURNSTILE_SITE_KEY": "1x00000000000000000000AA", "PUBLIC_MEDIA_BASE_URL": "", "CLIENT_SLUG": "demo",
             "JOBS_MODE": "queue", "WHATSAPP_PHONE_NUMBER_ID": "", "WHATSAPP_WABA_ID": "", "META_GRAPH_VERSION": "" }
   ```
3. **Custom entrypoint `src/worker.ts`** — follow the `@astrojs/cloudflare` docs ("custom entrypoint") for the installed version. Shape:
   ```ts
   // Worker entrypoint: Astro handles HTTP; jobs and cron are dispatched to the application layer.
   import astro from "<adapter server entrypoint per docs>";
   export default {
     fetch: astro.fetch,
     async queue(batch, env, ctx) { await createApp(env, ctx).jobs.consumeBatch(batch); },   // routes main queue vs DLQ by batch.queue
     async scheduled(controller, env, ctx) { await createApp(env, ctx).jobs.onCron(new Date(controller.scheduledTime)); },
   } satisfies ExportedHandler<Env>;
   ```
   If the adapter version cannot do this, fallback (log in DECISIONS.md): a second tiny Worker per client (`src/jobs-worker.ts`, own wrangler config generated
   by `use-client.mjs`) consuming the same queue with the same `application` + `infrastructure` code (halves the max number of clients per account).
4. `scripts/use-client.mjs`: merge base + `clients/<slug>/client.jsonc` (`jsonc-parser`), replace placeholders (`__QUEUE__`, `__DLQ__`, `__CRON__`,
   `__AE_DATASET__`, …), set `name`, `account_id`, `routes` from `customDomains` (`{ pattern, custom_domain: true }`), merge `vars`, write root
   `wrangler.jsonc` with a "GENERATED" header.
5. `scripts/new-client.mjs <slug>`: validate slug `^[a-z0-9-]{2,30}$`; `wrangler d1 create <slug>-db`, `wrangler r2 bucket create <slug>-media`,
   `wrangler kv namespace create <slug>-cache`, `wrangler queues create <slug>-jobs`, `wrangler queues create <slug>-jobs-dlq`; parse ids (ask the user
   to paste if parsing fails); next `rateLimitNamespaceBase`; write `clients/<slug>/client.jsonc` + empty `extensions/index.ts`. Run for `demo`.
   Create `clients/_default/extensions/index.ts`.
6. `scripts/client-secrets.mjs <slug>` (`wrangler secret bulk`). `.dev.vars.example`:
   ```
   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
   DLOCALGO_API_KEY=            DLOCALGO_SECRET_KEY=
   PAYPAL_CLIENT_ID=             PAYPAL_CLIENT_SECRET=          PAYPAL_WEBHOOK_ID=
   GOOGLE_PLACES_API_KEY=        SETUP_TOKEN=change-me-long-random
   WHATSAPP_TOKEN=               WHATSAPP_VERIFY_TOKEN=         META_APP_SECRET=
   META_CAPI_TOKEN=
   ```
7. `npm run cf-typegen`; add optional secrets to `Env` in `src/env.d.ts` if missing.
8. `src/infrastructure/cloudflare/env.ts`: `getEnv()` (`import { env } from "cloudflare:workers"`), `readSecret(name)` (empty → null),
   `getExecutionContext(locals)` per adapter docs. ONLY file touching `cloudflare:workers`.
9. `src/pages/api/health.ts`: `{ ok, d1 }` (temporary direct `getEnv()`; switch to `locals.app` in Stage 5).

Done when: `npm run dev` → `/api/health` → `{"ok":true,"d1":true}`; `curl "http://localhost:4321/cdn-cgi/local/scheduled?cron=*/15+*+*+*+*"`
reaches `scheduled()` (log line); root `wrangler.jsonc` generated and gitignored.

### Stage 2 — Shared kernel, i18n and formatting

1. `domain/shared/*` (section 6) + `slugify` (NFD, strip diacritics, lowercase, `-`, max 80) + `Paginated<T>` + `normalizePhone` + `sanitizeHex`.
   `domain/ordering/tax.ts`, `totals.ts`; `domain/inventory/stock.ts`; `domain/catalog/catalog-query.ts` (parse/normalize/serialize/indexable).
2. `domain/shared/format.ts`: `formatMoney(money, locale, country)`, `formatDate`, `formatNumber`, `formatPercent(bp)`, `intlLocale(locale, country)`
   (pure Intl; re-exported by `ui/lib/format.ts`; used by documents, CSV and WhatsApp params — one implementation).
3. `domain/shared/paths.ts`: every public path pattern (home, shop, category, product, cart, checkout, order, orderInvoice, page). `ui/lib/routes.ts`
   (relative) and `application/documents/urls.ts` (absolute from `PUBLIC_SITE_URL`) both build on it.
4. i18n: `ui/i18n/dictionaries/en.ts` (source of truth) + `es.ts` typed `: Dictionary`; namespaces `common, nav, home, shop, filters, product, cart,
   checkout, order, invoice, contact, footer, legal, consent, errors, admin.*`; `t(locale, key, params)`, `getDictionary(locale)` (pass sub-trees to islands).

Done when: check/build pass; a DEV-only page renders a translated string, a formatted price and a normalized catalog query.

### Stage 3 — Database schema and seed data

1. `db/migrations/0001_initial.sql` (section 5); `npm run db:migrate:local`.
2. `db/seed/dev.sql`: settings (general: "Demo Store", es, USD, CO, America/Bogota; contact with demo WhatsApp; checkout all 5 methods; tax incl. 1900 bp IVA/VAT;
   invoicing enabled "FV"; inventory defaults; catalog defaults), 2 shipping methods, attributes Size (S,M,L,XL) + Color (Black, White, Red, Blue with hex),
   3 categories (es/en), 12 products (es/en, variants with SKU/barcode/cost/stock, some on sale, some new, one tax-exempt, two out of stock),
   `inventory_movements` "initial" rows matching seeded stock, FTS rows.
3. `npm run db:seed:local`; verify counts with `wrangler d1 execute DB --local --command "..."`.

Done when: migrate + seed apply cleanly on a fresh `.wrangler` state.

### Stage 4 — Domain model and application ports

1. Domain entities and rules: `Product` (+ `computePriceRange`, `computeIsOnSale`, `assertVariantsConsistent`: ≤ 3 attributes, unique combos, ≤ 100 variants,
   exactly one variant without attributes), `variantLabel`, `effectivePrice`; order status transitions (`pending_payment → paid|cancelled`,
   `paid → processing|refunded|cancelled`, `processing → shipped|cancelled`, `shipped → delivered`; terminal delivered/cancelled/refunded);
   `shippingCost`; `clampQuantity(requested, available, max = 20)`; `formatInvoiceNumber(series, n)` → `FV-000123`; `can(role, permission)`.
2. All ports in `application/ports/*` (section 6).
3. `application/forms/fields-to-schema.ts` (each `FieldDescriptor.kind` → zod; localized kinds → `{es,en}`; `required` = default locale only;
   `image` → uuid|null; lists with `max`; `link` → `{ href ("/" or "https://"), label }`; `repeater` → array of nested objects).
4. `application/content/settings-schemas.ts` — zod with `.default()` + `FieldDescriptor[]` per group:
   - `general`: storeName, logoMediaId, faviconMediaId, defaultLocale, currency, country, timezone.
   - `contact`: email, phone, whatsappNumber, whatsappMessage (LocalizedText), showWhatsappFloat, address, mapsEmbedUrl (`https://www.google.com/maps/embed?`),
     openingHours (LocalizedText), social { instagram, facebook, tiktok, youtube, x }.
   - `theme`: colorPrimary, colorOnPrimary, colorAccent, colorBackground, colorSurface, colorText, fontPreset (`inter|manrope|playfair`), radius.
   - `catalog`: pageSize (24), newDays (30), defaultSort (`featured`), showOutOfStock (`last` | `hide` | `normal`), showStockOnProduct (`never|low|always`),
     lowStockDisplayThreshold (5).
   - `inventory`: defaultLowStockThreshold (3), lowStockAlerts (true), lowStockAlertChannels (`email`,`whatsapp`), backInStockEnabled (true).
   - `checkout`: enabledMethods, bankTransferInstructions (LocalizedText md), cashOnDeliveryNote, onlineHoldMinutes (45), manualAutoCancelDays (0),
     paypalSettlementCurrency, paypalExchangeRate, orderNotificationEmail, whatsappOptInDefault (false).
   - `tax`: pricesIncludeTax (true), defaultRateBp (1900), label ({es:"IVA",en:"VAT"}), taxShipping (false), showBreakdown (true).
   - `invoicing`: enabled, autoIssue (`on_paid|manual`), series ("FV"), legalName, taxId, taxIdType, taxRegime, address, phone, email,
     footerNotes (LocalizedText), attachPdf (true), askBuyerTaxId (true), sendPdfByWhatsapp (true).
   - `whatsapp`: enabled (false), alertsNumber, defaultCountryCode ("57"), channelsPerKey (map NotificationKey → { email: bool, whatsapp: bool }).
   - `marketing`: metaPixelId, metaCapiEnabled, metaTestEventCode, feedEnabled (true), feedBrand, feedColorAttribute ("color"), feedSizeAttribute ("size"),
     consentBannerMode (`auto` = shown only when a marketing tool is enabled | `always`).
   - `reports`: weeklySummaryEnabled (true), weeklySummaryWeekday (1 = Monday), weeklySummaryHour (8), slowMoverDays (60).
   - `seo`: titleTemplate, defaultDescription, ogImageMediaId.  `integrations`: googlePlaceId, showGoogleReviews, webAnalyticsToken.
5. Widget definitions (`application/content/widgets/`, one file each + `registry.ts` merging `@client`): `hero_carousel`, `featured_products`,
   `category_grid`, `promo_banner`, `rich_text`, `testimonials`, `image_gallery`, `faq`, `whatsapp_cta`, `trust_badges`.
6. `application/content/defaults/`: system pages (home demo sections, about, contact intro, privacy, terms, shipping-returns). Full **bilingual** legal texts
   (GDPR, CCPA/CPRA, LGPD, Colombia Law 1581/2012; processors: Cloudflare, dLocal Go, PayPal, Google, **Meta (WhatsApp, Pixel/Conversions API)**; cookies & consent
   section). Placeholders replaced by ONE `fillPlaceholders(text, vars)` (reused by the template engine).

Done when: check/build pass; no boundary violations.

### Stage 5 — Infrastructure adapters, jobs, composition, HTTP helpers

1. `infrastructure/system/*`; `infrastructure/d1/d1-client.ts` (`all`, `first`, `run`, `batch`, JSON/bool helpers).
2. D1 repositories (one file each): settings, pages, testimonials, contact messages, media, categories, attributes, products, inventory, shipping,
   orders, payment events, invoices, email templates, WhatsApp templates, notification log, failed jobs, admin users, sessions, password resets,
   and `D1CatalogQueryService` (filters in Stage 7).
   **Stock ledger rule (implement once in `d1/stock-statements.ts`, reused by products, inventory and orders):**
   `stockChangeStatements(variantId, delta, reason, ref, note, actor)` returns two statements for the same batch:
   `UPDATE product_variants SET stock = stock + ?delta WHERE id = ?` and
   `INSERT INTO inventory_movements (..., stock_after, ...) VALUES (..., (SELECT stock FROM product_variants WHERE id = ?), ...)`.
   Before the batch read current stock + threshold to return `StockChange[]`. `CHECK constraint failed` → `DomainError("OUT_OF_STOCK")` (batch rolls back).
   - `ProductRepository.save`: upsert product, translations, categories, images, variants + attribute values, `min/max_price_minor`, `is_on_sale`, FTS rows,
     and for variant stock edits → ledger `manual_adjust` (new variants → `initial`). Returns `StockChange[]`.
   - `OrderRepository.place`: tracked lines → ledger `sale` (ref = order id) + counter update + order insert with `(SELECT last_number …)` + items
     (with `unit_cost_minor` snapshot) + event. `cancelAndReleaseStock`: ledger `cancel_restore` only when `stock_released = 0`.
   - `InvoiceRepository.issue`: `INSERT … ON CONFLICT(series) DO UPDATE SET last_number = last_number + 1` + invoice insert with sub-select; UNIQUE `order_id` → `CONFLICT`.
3. `r2/r2-media-storage.ts`; `kv/kv-cache-store.ts`; `kv/kv-page-cache-version.ts` (`page-cache:version`, `cacheTtl: 60`, bump = `Date.now().toString(36)`).
4. Security: `Pbkdf2PasswordHasher` (100000 iterations — Workers max, 16-byte salt, 32-byte key, `pbkdf2_sha256$100000$<salt>$<hash>`, `timingSafeEqual`),
   `TurnstileVerifier`, `CloudflareRateLimiter`.
5. Email: `CloudflareEmailSender` (`env.EMAIL.send`, attachments `disposition: "attachment"`, reject > 5 MiB) + `ConsoleEmailSender`.
   Invoicing: `BrowserRunPdfRenderer` (`env.BROWSER.quickAction("pdf", { html, …A4/printBackground per docs })`), `NullPdfRenderer`, `NoopLegalInvoiceIssuer`.
6. **Jobs (Cloudflare Queues)** — see `docs/JOBS.md` (write it):
   - `application/jobs/job-types.ts`: one zod payload schema per `JobType` + `JobPayloads` map type.
   - `application/jobs/registry.ts`: `JOB_HANDLERS: { [T in JobType]: (payload, app) => Promise<void> }` — handlers call use cases only.
   - `application/jobs/dispatch.ts`: `consumeBatch(batch)` — for each message: validate envelope → run handler → `ack()`;
     `RetryableError` / network / 5xx / 429 → `retry({ delaySeconds: backoff(message.attempts) })` with backoff `[30, 120, 600, 1800, 7200]` s (cap 86400);
     `DomainError`/validation → log + `ack()` (permanent failure, recorded in `failed_jobs`). Messages from the DLQ queue → `FailedJobRepository.record` + `ack()`.
   - Idempotency: every envelope has `idempotencyKey`; handlers must be safe to run twice (notification log UNIQUE key, invoice `pdf_key` check,
     Meta `event_id` dedup, `stock_subscriptions.notified_at`).
   - `application/jobs/scheduler.ts`: `onCron(now)` runs every 15 min (the single client cron) and enqueues: `orders.expire_stale` (every tick);
     `reviews.refresh` (every 6 h); `analytics.daily_rollup` + `maintenance.purge` (once per day after 03:00 store time); `reports.weekly_summary`
     (configured weekday/hour store time). "Once per period" guarded by KV keys `cron:last:<job>:<period>`.
   - `infrastructure/queues/cloudflare-job-queue.ts` (`env.JOBS.send / sendBatch`, `delaySeconds` ≤ 86400) and `inline-job-queue.ts`
     (`JOBS_MODE=inline` or missing binding: runs the handler via `ctx.waitUntil`; used only in dev).
   - Admin use cases: `ListFailedJobs`, `RetryFailedJob` (re-enqueue with the same idempotency key), `DiscardFailedJob`.
7. `composition/create-app.ts`: lazy getters grouped `app.catalog, cart, inventory, ordering, payments, invoicing, notifications, marketing, analytics,
   reports, content, media, identity, admin, jobs`. Gateways in one array; marketing sinks in one array.
8. `http/`: `errors.ts` (NOT_FOUND 404, VALIDATION_FAILED 422, OUT_OF_STOCK/PRODUCT_UNAVAILABLE/CONFLICT/INVALID_STATE 409, UNAUTHORIZED 401, FORBIDDEN 403,
   RATE_LIMITED 429, BOT_CHECK_FAILED 400, PAYMENT_* 502, unknown 500), `define-endpoint.ts` (incl. CSV format), `cookies.ts`, `request-info.ts`
   (IP from `CF-Connecting-IP`, country from `request.cf.country`, device from UA), `log.ts`.
9. Middleware composed with `sequence()`: `request-context`, `security-headers` (Stage 23), `locale`, `admin-auth` (Stage 13), `origin-check`
   (except `/api/webhooks/*`), `analytics` (Stage 19, no-op now), `page-cache` (Stage 21, no-op now). Health → `locals.app`.

Done when: check/build pass; enqueue a test job from a DEV route → consumed by `queue()` locally (log); a handler throwing `RetryableError` is retried with delay;
a permanently failing job lands in `failed_jobs`; no file outside `composition` imports `infrastructure`.

### Stage 6 — Design system and layouts (mobile-first)

1. `ui/styles/global.css` (`@import "tailwindcss"`, `@theme` → CSS vars, focus ring, `@view-transition { navigation: auto; }`, reduced motion) + `animations.css`
   (`fade-in`, `slide-up`, `scale-in`, `shimmer`, `drawer-in`, `[data-reveal]`). Import `@client` stylesheet if any.
2. `ui/lib/theme-css.ts`: `themeToCss(theme)` with `sanitizeHex` + `color-mix()`; reused by email layout and invoice document.
3. Primitives (typed props + JSDoc): `Button`, `IconButton`, `Icon` (SVG sprite ~35 icons), `Badge`, `Price`, `ResponsiveImage`, `Rating`, `Skeleton`, `EmptyState`,
   `Field/Input/Select/Textarea/Checkbox/Radio/Switch`, `RangeSlider` (two native range inputs + number inputs), `Accordion` (native `<details>`),
   `Dialog`/`Drawer` (native `<dialog>`, one controller), `Carousel` (scroll-snap + `scripts/carousel.ts`, used by every carousel), `Toaster`.
   Charts `ui/components/charts/`: `LineChart`, `BarChart`, `Sparkline` — server-rendered SVG Astro components (axis labels, tooltips via `<title>`, accessible table fallback).
4. `ui/lib/media-url.ts` (`mediaUrl`, `buildSrcSet`), `ui/lib/whatsapp.ts` (`whatsappLink`) — single implementations.
5. Layouts: `BaseLayout` (lang, meta, theme vars, title via `seo.ts`, canonical, hreflang `alternates`, robots meta, OG, Web Analytics beacon, consent-gated Pixel slot),
   `StoreLayout` (sticky Header: logo, search, locale switcher, `CartBadge`; `MobileTabBar` Home/Shop/Search/Cart/Contact; Footer; `WhatsAppFloat`; `ConsentBanner`;
   `CartDrawer`; `Toaster`; reveal script). `LocaleSwitcher` uses `alternates` + `locale` cookie.

Done when: DEV-only `/es/ui-kit` shows all primitives and charts at 360px without horizontal scroll.

### Stage 7 — Public storefront: home, catalog with filters, product

1. `/` → 302 `/<locale>/` (cookie → `Accept-Language` → default). `GetPage` + `ResolvePageSections` (all widget data in one pass) + `SectionRenderer`; home.
2. **Catalog filters (full spec)** — `shop/index.astro` and `shop/[category].astro` share `CatalogView.astro`:
   - **Facets**: categories (tree, counts), each attribute with `is_filterable` (values with counts; swatches for color), price range (min/max of the current
     result set; `RangeSlider` + inputs, major units in URL), availability (in stock), on sale, new arrivals (`created_at` within `catalog.newDays`), search `q`.
   - **Semantics**: OR inside one facet, AND across facets. Counts are **disjunctive** (each facet's counts ignore that facet's own selection) — implemented in
     `D1CatalogQueryService.getFacets` with one query per facet group, all sharing ONE `buildWhere(query, { exclude })` helper (no duplicated SQL).
     Values with zero results are shown disabled (not hidden) to keep the layout stable.
   - **URL**: `?q=&category=<slug>&v=<valueId>&v=…&min=&max=&stock=1&sale=1&new=1&sort=&page=`. `parseCatalogQuery` normalizes; when the incoming
     search string differs from `catalogQueryToSearchParams(query)` → 301 to the canonical URL (better cache hit rate + SEO).
   - **SEO**: `isIndexableCatalogQuery` false → `<meta name="robots" content="noindex,follow">` + canonical to the unfiltered category; page ≥ 2 indexable with self canonical.
   - **Sorting**: relevance (only with `q`), featured, newest, price asc/desc, best sellers. `showOutOfStock = last` sorts out-of-stock items last; `hide` excludes them.
   - **Mobile UI**: sticky toolbar ("Filtros (n)", sort select, result count) → `FilterSheet` bottom-sheet Drawer with an `Accordion` per facet, counts, and a sticky
     "Ver N resultados" button whose N updates via `GET /api/catalog/count` (debounce 300 ms, `RL_API`) — without JS the GET form submit still works.
     "Limpiar" resets. **Desktop (lg+)**: the same `FilterPanel` component rendered as a left sidebar (one component, two placements).
     `ActiveFilters` chips (each removes one value) + "clear all". Results grid 2/3/4 cols, `ProductCard` (second image on hover desktop, `Price`, badges
     sale/new/out-of-stock, quick add for single-variant products), `Pagination` (`rel=prev/next`), empty state with "clear filters".
   - **Search suggestions**: `SearchOverlay` + `GET /api/search/suggest` (FTS prefix, debounce 250 ms, min 2 chars, `RL_API`).
3. Product page: 404 if not active; `ProductGallery` (Carousel + thumbnails); price with tax label; stock text per `showStockOnProduct`; `VariantPicker` island
   (disables impossible/out-of-stock combos, updates price/stock/image/SKU); `AddToCart` island; `BackInStockForm` island shown when the selected variant is
   out of stock (email, optional WhatsApp phone + opt-in, Turnstile → `POST /api/stock-subscriptions`, `RL_FORMS`); markdown description; "Ask on WhatsApp";
   related products Carousel; breadcrumbs; `alternates`.

Done when: in `/es` and `/en` at 360px every filter combination works with correct counts, URLs are canonical (301 on unordered params), filtered pages are
`noindex`, the count button updates live, and switching language keeps the same product.

### Stage 8 — Cart

1. `ui/stores/cart.ts` (`persistentAtom("cart:v1")`, lines with snapshot, actions `addItem/setQuantity/removeItem/clear/replaceFromQuote`, computed count/subtotal, `cartOpen`).
2. `QuoteCart` + `POST /api/cart/quote` (public, `RL_API`, ≤ 50 lines): current price/stock, clamped qty, flags `unavailable|priceChanged|quantityAdjusted`,
   totals via `computeOrderTotals` (tax breakdown), shipping methods, enabled payment methods, buyer tax-ID request flag. The only trusted price source.
3. `CartDrawer`, `CartBadge`, `cart.astro` + `CartPage` island (quote on mount/change, notices, sticky checkout bar).

Done when: cart persists across navigation/reload; a price change in D1 shows "price updated" after quote.

### Stage 9 — Notifications: engine, email templates, multichannel service

1. `application/documents/`: `html.ts`, `email-layout.ts` (table-based, inline styles, 600px, logo, theme button color, footer), `blocks.ts` (email-safe
   `orderItems`, `orderTotals`, `shippingAddress`, `bankInstructions`, `orderButton`, `trackingInfo`, `invoiceButton`, `resetButton`, `contactMessage`,
   `whatsappButton`, `lowStockTable`, `weeklyKpis`), `html-to-text.ts`, `csv.ts` (RFC 4180 escaping, UTF-8 BOM), `urls.ts`.
2. `application/notifications/template-engine.ts` (own, tiny): markdown → micromark (safe) → substitute in HTML: `{{path}}` (escaped), `{{#if path}}…{{else}}…{{/if}}`
   (one nesting level), `{{> block}}` (whitelisted; a paragraph with only a block is replaced by the block). Subject = plain text, ≤ 200 chars.
   `validateTemplate(def, subject, body)` → unknown variables/blocks.
3. `application/notifications/email/`: one definition per `NotificationKey` (audience, name/description, variables with samples, allowed blocks, bilingual default
   subject/body, `sampleContext()`).
4. `NotificationService.notify({ key, recipient, context, orderId?, attachments? })` — **enqueues, never sends inline**:
   resolves channels (`whatsapp.channelsPerKey[key]`, defaults: email on; WhatsApp on only when configured, template approved for the locale and — for customers —
   `whatsappOptIn`); for each channel creates a `notification_log` row `queued` with `idempotencyKey = <key>:<orderId|ref>:<channel>:<recipient>` (duplicate → skip)
   and enqueues `notify.email` / `notify.whatsapp`. Attachments are not put in messages: handlers re-generate/fetch them (e.g. invoice PDF from R2).
   Locale rules: customer = order locale; store alerts = default locale; admins = their locale.
5. Job handler `notify.email`: load override or default → skip if disabled → render → `EmailSender.send` → `markSent` / `markFailed` (+ `RetryableError` for 5xx/timeouts).
6. Admin use cases (UI in Stage 17): list/get/save/restore/preview/send-test for email templates; `ListNotificationLog`.

Done when: DEV route previews every email in both languages; `notify()` produces queued log rows and the consumer sends them (console in dev); invalid variables are rejected.

### Stage 10 — Checkout, payments, orders

1. `PlaceOrder`: input `locale`, `items`, `customer { name, email, phone }`, `whatsappOptIn`, `billing?`, `shippingMethodId`, `address` (unless pickup), `note?`,
   `paymentMethod`, `turnstileToken`, `attribution` (UTM/referrer/fbclid captured client-side from the landing page, stored in sessionStorage).
   Steps: bot check → re-quote (`PRODUCT_UNAVAILABLE`/`OUT_OF_STOCK`) → `computeOrderTotals` → access key (store SHA-256) → `expiresAt`
   (online: + `onlineHoldMinutes`; manual: + `manualAutoCancelDays`, null when 0) → `OrderRepository.place` → `gateway.initiate()` → `setPaymentReference` →
   enqueue: `order_received` + `order_alert_store` notifications, low-stock checks for returned `StockChange[]` (Stage 15 handler; no-op until then),
   tracking `purchase` is NOT sent here (only on payment) → return `{ number, next, orderUrl }`. On `initiate` failure: `cancelAndReleaseStock` + `PAYMENT_PROVIDER_ERROR`.
2. `POST /api/checkout` (public, `RL_FORMS`, `botCheck`).
3. Gateways:
   - **dLocal Go** (fetch, `Authorization: Bearer <api key>:<secret key>`): `POST /v1/payments` (hosted checkout) with currency, a decimal amount built from the integer digits,
     country, `order_id` (the order number), payer email, `success_url …/checkout/success?order=<n>&key=<k>`, `back_url …/checkout/cancel?order=<n>&key=<k>`, `notification_url`
     and an expiry of max(30, onlineHoldMinutes) minutes; redirect to the returned `redirect_url`. Webhook: dLocal Go posts only `{payment_id}` (or a refund id), signed in the
     `Authorization` header as `V2-HMAC-SHA256, Signature: <hex>` = HMAC-SHA256 of the API key followed by the raw body, keyed with the secret key; the store verifies it,
     asks dLocal Go for the payment (`GET /v1/payments/:id`) and maps `PAID` → succeeded, `CANCELLED` → failed, `EXPIRED` → expired (`REJECTED` and `PENDING` change nothing:
     the buyer can retry inside the same checkout); a fully refunded payment → refunded.
   - **PayPal** (fetch): token cached in KV; create order with `item_total`/`tax_total`/`shipping` breakdown and `experience_context` (`return_url`, `cancel_url`,
     `user_action: "PAY_NOW"`, `shipping_preference: "NO_SHIPPING"`); redirect to `payer-action`; **our param is `key`** (PayPal adds `token`); return page →
     `CapturePayPalOrder`; webhook verified via `/v1/notifications/verify-webhook-signature`; unsupported currency → settlement currency + exchange rate, else hidden.
   - **Manual**: `whatsapp` → `whatsappLink(contact.whatsappNumber, message)`; `bank_transfer`, `cash_on_delivery` → confirmation.
4. `ConfirmPayment` (webhooks + PayPal return; idempotent via `PaymentEventLog`): verify amount/currency → succeeded: `paid`, `paid_at`, `sales_count`, notify
   `payment_confirmed`, `IssueInvoice` (Stage 11 hook), tracking `purchase` event (Stage 19 hook); expired/failed: `cancelAndReleaseStock` + `order_cancelled`;
   refunded: `refunded` + `order_refunded`.
5. `ExpireStaleOrders` = handler of job `orders.expire_stale` (limit 50/run) — scheduled by the cron (Stage 5) and also enqueued after each `PlaceOrder`.
6. UI: `CheckoutForm` island (Contact → Delivery → optional invoice data → Payment → WhatsApp updates opt-in checkbox (default from settings) → summary with tax lines →
   Turnstile → sticky pay bar); success, cancel and order status pages (`key` constant-time check; timeline; invoice link). `no-store` everywhere in checkout/orders.

Done when (local): a dLocal Go sandbox test card marks paid; PayPal sandbox marks paid; WhatsApp opens wa.me; bank/COD instructions; oversell fails nicely;
expired orders restore stock (ledger shows `sale` then `cancel_restore`); notifications are queued and consumed.

### Stage 11 — Invoicing (own invoice + PDF + legal port)

1. `application/documents/invoice-document.ts`: `renderInvoiceHtml(invoice, { theme, logoDataUri, locale })` — self-contained A4 HTML (seller, buyer, lines, tax
   breakdown, totals, payment method, notes, VOID watermark, legal reference). Same HTML for web, admin and PDF.
2. `IssueInvoice(orderId)` (idempotent; requires paid+ status and `invoicing.enabled`): snapshot → `InvoiceRepository.issue` → enqueue `invoice.render_pdf`
   (→ R2 `invoices/<id>.pdf`, then `invoice_issued` notification with PDF attached by email and as WhatsApp document when enabled) and `invoice.legal_issue` when enabled.
3. `VoidInvoice` (owner; cancelled/refunded orders; re-render with watermark), `GetInvoicePdf` (generate on demand if missing).
4. Customer: `/[locale]/orders/[number]/invoice?key=` + `GET /api/orders/[number]/invoice.pdf?key=` (`attachment; filename="FV-000123.pdf"`, `no-store`).
5. DECISIONS.md: not a certified e-invoice; legal compliance = new `LegalInvoiceIssuer` adapter per country/provider.

Done when: paying auto-issues `FV-000001`, PDF stored and attached, downloadable; void shows watermark; two quick payments get consecutive numbers.

### Stage 12 — Content pages, contact, reviews

1. about/privacy/terms/shipping-returns/`p/[slug]` via `GetPage` + `SectionRenderer`.
2. Contact: sections + contact block (WhatsApp, call, email, address, hours, social), `MapFacade` (no Google request before click), `ContactForm`
   (honeypot + Turnstile → `POST /api/contact`, `RL_FORMS`) → save + notify `contact_message_store` (+ `contact_autoreply`).
3. Reviews: job `reviews.refresh` fetches Places API (New) `GET https://places.googleapis.com/v1/places/<id>?languageCode=<locale>` with `X-Goog-Api-Key` and
   `X-Goog-FieldMask: rating,userRatingCount,reviews,googleMapsUri` → KV `reviews:google:<locale>`; pages only read KV (never call Google inline).
   Merge with testimonials; Google attribution + "Write a review" link.

Done when: content pages render in both locales; contact saves + notifies; map loads only on click; reviews come from KV.

### Stage 13 — Admin foundation and authentication

1. Identity use cases: `SetupFirstOwner` (empty users + `SETUP_TOKEN`; creates system pages), `Login` (rate limit `auth:<ip>:<email>`, Turnstile, generic error),
   `Logout`, `GetSessionUser`, `RequestPasswordReset` (30 min token, `admin_password_reset`), `ResetPassword` (kills sessions), `ChangeOwnPassword`,
   `InviteAdmin` (`admin_invite`), `UpdateProfile` (name, locale, phone for WhatsApp alerts).
2. Sessions: 32-byte token in `__Host-admin_session` (dev: `admin_session` without `Secure`), SHA-256 stored, 14 days, sliding refresh < 7 days.
3. `admin-auth` middleware (HTML → login redirect with `next`; API → 401; `locals.admin`; `auth: "owner"` checks role; `no-store` + `X-Robots-Tag: noindex`).
4. `AdminLayout` (mobile bottom tabs: Dashboard, Products, Orders, Reports, More; `lg` sidebar), `AuthLayout`.
5. Shared admin UI: `api-client.ts`; **`ListToolbar`** (search, filter chips, select filters, `DateRangePicker` with presets today/7d/30d/this month/last month/YTD/custom,
   sort, page size) with state **in the URL query** (shareable, back-button friendly) via one `useUrlFilters` hook — used by EVERY admin list (products, inventory,
   movements, orders, invoices, messages, notification log, failed jobs, reports); `DataTable` (cards on mobile, table on md+), `StickySaveBar`, `ConfirmDialog`, `StatusBadge`.

Done when: setup/login/logout/reset/invite work; protected routes redirect; repeated failed logins → 429; `ListToolbar` round-trips filters through the URL.

### Stage 14 — Admin catalog and media

1. Media library + picker; `image-processing.ts` (accept jpeg/png/webp; `createImageBitmap(..., { imageOrientation: "from-image" })`; widths 480/960/1600;
   webp 0.82 else jpeg 0.85) → `POST /api/admin/media` (≤ 10 MB) → validate MIME + magic bytes → R2 `media/<id>/<w>.<ext>`; `GET /media/[...key]` immutable cache.
2. Categories (reorder, drawer editor, auto slug), Attributes (values, swatches, `is_filterable` toggle, position = filter order; delete blocked when in use).
3. Products list (ListToolbar: search, status, category, on sale, out of stock; quick status toggle; duplicate).
4. `ProductEditor` (ES|EN tabs, pricing + compare-at, tax override, status/featured/categories, images, variants via `VariantMatrix` with SKU, barcode, price, cost,
   stock (edits create `manual_adjust` ledger rows with optional note), low-stock threshold, track inventory, active, image; bulk set). `UpsertProduct` validates with the same schema.
5. Admin mutations auto-bump page cache (`defineEndpoint` default).

Done when: a product with 2 attributes, 6 variants and 4 images is created from a phone and appears correctly (and filterable) in both store languages.

### Stage 15 — Inventory module

1. `/admin/inventory` — `InventoryTable` (variant rows: image, product, variant label, SKU, barcode, stock, threshold, cost, retail value, status badge),
   ListToolbar filters: search (name/SKU/barcode), category, status (`in_stock|low|out|untracked`), sort by stock/value. Totals bar: units, valuation at cost and at retail.
2. `StockAdjustDrawer`: delta or "set to" (converted to delta), reason (`restock|manual_adjust|return|damage`), note → `AdjustStock` use case → `InventoryRepository.adjust`.
   Bulk adjust for selected rows. Inline +/− on mobile.
3. `BarcodeScanner` (progressive: `BarcodeDetector` + camera via `getUserMedia`; hidden when unsupported; manual input fallback) → `findVariantByCode` → opens the adjust drawer.
4. CSV: export current filtered list (`defineEndpoint({ format: "csv" })`); import `CsvImport` island (columns `sku,mode,quantity,cost,note`, mode `set|add`;
   client-side parse + preview with per-row validation; server `ImportStock` applies in batches of 50, ledger reason `import`, reference = batch id; result summary).
5. `/admin/inventory/movements`: ledger with filters (variant, reason, actor, date range), CSV export.
6. Alerts: after any `StockChange[]` (orders, adjustments, imports, product saves) call `EvaluateStockChanges` (one use case) →
   `crossedLowStock` → enqueue `inventory.low_stock_alert` (dedupe per variant per day via idempotency key) → `low_stock_store` notification (email + WhatsApp to owner);
   `cameBackInStock` → enqueue `inventory.back_in_stock` → notify pending `stock_subscriptions` (`back_in_stock`, email + WhatsApp if opted in) → `notified_at`.
7. Dashboard widgets (Stage 16) read low/out-of-stock counts from here.

Done when: adjusting, importing and selling all appear in the ledger with correct `stock_after`; crossing the threshold sends one alert; restocking a
subscribed variant notifies subscribers once; scanning a barcode on an Android phone opens the right variant.

### Stage 16 — Admin orders, invoices, messages, dashboard, ops

1. Orders list (ListToolbar: status, method, date, search number/email/phone, "new since last visit") and detail (items, totals, customer, billing, address,
   attribution, payment, timeline, notification log for this order; status actions per `order-status.ts` with "notify customer" toggle; WhatsApp customer button;
   copy link; invoice panel: issue/view/download/resend/regenerate PDF/retry legal/void).
2. Invoices list (filters, period totals, CSV) + detail (`renderInvoiceHtml` in admin layout).
3. Messages inbox; Notification log (`/admin/notification-log`: channel, status, template, recipient, error; retry failed → re-enqueue).
4. Failed jobs (`/admin/jobs`): list from `failed_jobs`, payload viewer, Retry / Discard; queue backlog via `env.JOBS.metrics()` if available.
5. Dashboard: KPIs today/7/30 days (orders, revenue, AOV, tax), pending orders, low/out of stock, unread messages, failed notifications/jobs, top products, 14-day `LineChart`.

Done when: from a phone an order goes `pending_payment → delivered` with notifications per step; failed jobs can be retried from the admin.

### Stage 17 — Admin content: page builder, settings, email templates, users

1. `SchemaForm` (renders any `FieldDescriptor[]`; client + server validation via `fieldsToSchema`) — powers widgets AND all settings.
2. `PageBuilder` (add/edit/enable/duplicate/delete/reorder sections, title/SEO per locale, publish, preview; custom pages CRUD; system pages undeletable).
3. Testimonials CRUD; Shipping methods CRUD.
4. Settings `/admin/settings/[group]` for every group in Stage 4 (theme live preview; invoicing "preview invoice"; integrations show secret/binding status only).
5. `EmailTemplateEditor` (`/admin/emails`, `/admin/emails/[key]`): ES|EN tabs, subject, markdown body, variables/blocks sidebar (click to insert), live preview iframe
   (`srcdoc`, sandboxed, debounce 400 ms), validation, send test, restore default, enabled toggle (store alerts: owner only).
6. Users (owner): invite, role, deactivate, delete (never last owner).

Done when: from a phone the home is rearranged, theme changes apply after save, and a customized "order shipped" email works in preview, test and real flow.

### Stage 18 — WhatsApp Cloud API adapter + templates (Meta)

Write `docs/WHATSAPP.md` (setup: Meta Business, WhatsApp Business Account, phone number, system-user permanent token with `whatsapp_business_messaging` and
`whatsapp_business_management`, app secret, webhook URL + verify token; costs: Meta charges per template message; opt-in policy).

1. `infrastructure/meta/graph-client.ts` — ONE Graph API client shared by WhatsApp and CAPI: base `https://graph.facebook.com/<META_GRAPH_VERSION>/`
   (verify the current version in Meta docs and set it in `client.jsonc` vars), bearer token, JSON, error mapping (rate limit / 5xx / timeouts → `RetryableError`,
   auth/validation → `DomainError`), request timeout via `AbortSignal.timeout(10000)`. `meta-signature.ts`: verify `X-Hub-Signature-256` (HMAC-SHA256 with `META_APP_SECRET`, constant-time).
2. `WhatsAppCloudSender` (`POST /{WHATSAPP_PHONE_NUMBER_ID}/messages`, `messaging_product: "whatsapp"`, `type: "template"`, components: body parameters (text),
   optional URL button parameter, optional document header — upload PDF first via `POST /{phone_number_id}/media` (multipart) and use the returned media id).
3. `WhatsAppTemplateCatalog` (`GET /{WABA_ID}/message_templates?fields=name,language,status,category`, `POST /{WABA_ID}/message_templates` with
   `name`, `language`, `category: "UTILITY"`, `components` (BODY with `{{n}}` + `example.body_text`, optional HEADER DOCUMENT, optional URL BUTTON with example)).
4. `application/notifications/whatsapp/`: one definition per customer-facing and store-alert key (order_received, payment_confirmed, order_shipped,
   order_delivered, order_cancelled, invoice_issued (document header), back_in_stock, order_alert_store, low_stock_store, weekly_report_store): suggested
   `metaName` (`<prefix>_order_shipped`), bilingual body with `{{1}}..{{n}}`, ordered `params` (context paths, e.g. `customer.firstName`, `order.number`,
   `order.trackingCode`), URL button suffix path (e.g. order path with `key`), samples. Values are formatted with `domain/shared/format.ts`.
5. Job handler `notify.whatsapp`: load config (DB row seeded from code definition) → require approved status for the language → map params from context →
   `sendTemplate` → `markSent(providerMessageId)`; not approved/disabled → `markSkipped`.
6. Webhook `/api/webhooks/whatsapp`: `GET` verification (`hub.mode=subscribe`, `hub.verify_token` == `WHATSAPP_VERIFY_TOKEN` → return `hub.challenge`);
   `POST` signature check → status updates (`sent|delivered|read|failed`) → `notification_log.updateByProviderId`. Incoming customer messages: logged only (backlog: inbox).
7. Admin `/admin/whatsapp` (`WhatsAppTemplatesManager`): connection status (ids + token configured), per-template card: enabled toggle, channel toggles per key,
   editable body per language (before submission), param mapping (select variable for each `{{n}}`), **Submit to Meta**, **Sync status** (APPROVED/PENDING/REJECTED
   + reason), **Send test** to the admin's phone. Approved templates become read-only (editing requires a new template name → re-approval; explained in the UI).
8. Checkout opt-in (Stage 10) and back-in-stock opt-in are required before messaging customers; store alerts go to `whatsapp.alertsNumber` / owner phone.

Done when: with a test WhatsApp number, templates are submitted and synced, an order's "shipped" update arrives on WhatsApp with the tracking code and order link,
the invoice PDF arrives as a document, delivery/read statuses update the log, and disabled/unapproved templates are skipped (logged).

### Stage 19 — Tracking, consent and Meta marketing (Pixel + Conversions API + catalog feed)

Write `docs/ANALYTICS.md` (event names, Analytics Engine data point schema, consent rules).

1. **Consent**: `ConsentBanner` replaces the cookie notice: categories `necessary` (always) and `marketing` (Meta). Shown when `consentBannerMode` requires it.
   Choice stored in cookie `consent=v1.m1` / `v1.m0` (readable by the server) + "Privacy settings" link in footer to change it.
   Own Analytics Engine events are cookieless/aggregate and run without marketing consent (documented in the privacy policy).
2. **Client tracking** `ui/lib/track.ts`: `track(name, data)` → generates `eventId` → if marketing consent + `metaPixelId`: `fbq("track", MetaName, params, { eventID })`;
   for `view_item`, `add_to_cart`, `begin_checkout` also `navigator.sendBeacon("/api/events", …)`. Pixel script injected only after consent (no Meta request before).
   Capture `fbclid` → `_fbc` format and UTM params on landing into sessionStorage (attribution sent with checkout).
3. **Server**: `analytics` middleware writes `page_view` / `view_item` (product paths) to Analytics Engine for every HTML GET (also on page-cache hits; non-blocking
   `writeDataPoint`). `POST /api/events` (public, `RL_API`, ≤ 10 events, validated) → `TrackEvent` use case → `AnalyticsWriter.write` + (if consent & CAPI enabled)
   enqueue `marketing.meta_capi`. `ConfirmPayment` emits `purchase` server-side (value, items, order id, hashed email/phone when consent was given at checkout).
4. `AnalyticsEngineSink` data point: `indexes: [clientSlug]`, `blobs: [event, path, productId, variantId, country, device, referrerHost, utmSource, utmCampaign, locale]`,
   `doubles: [valueMinor, quantity]`.
5. `MetaConversionsSink` (job handler `marketing.meta_capi`, uses `graph-client`): `POST /{pixelId}/events` with `data: [{ event_name (PageView|ViewContent|AddToCart|
   InitiateCheckout|Purchase), event_time, event_id (same as Pixel → dedup), action_source: "website", event_source_url, user_data { em/ph = SHA-256 of normalized
   lowercase email / digits phone, client_ip_address, client_user_agent, fbp, fbc, external_id }, custom_data { currency, value (major units), content_ids,
   contents, content_type: "product", order_id } }]`, `test_event_code` when set; secret `META_CAPI_TOKEN`.
6. **Product catalog feed** `GET /feeds/products.xml?locale=es` (RSS 2.0 + `g:` namespace; valid for Meta Commerce Manager and Google Merchant Center — ONE builder
   `BuildProductFeed`): per active variant `g:id` (variant id), `g:item_group_id` (product id), `g:title`, `g:description`, `g:link`, `g:image_link`,
   `g:additional_image_link`, `g:availability`, `g:condition` new, `g:price` (`12.00 USD`), `g:sale_price`, `g:brand`, `g:color`/`g:size` from configured attribute codes.
   `Cache-Control: public, s-maxage=3600`. Disabled when `feedEnabled = false`.

Done when: with consent the Pixel fires and Meta's Test Events tool shows browser + server events deduplicated by `event_id`; without consent no Meta request is made;
Analytics Engine receives events; the feed validates in Commerce Manager.

### Stage 20 — Reports

1. `ReportsQueryService` (D1) — every method takes `(range, tz, filters)`; grouping by store timezone via a single helper `localDayExpr(column, tz offset)`
   (offset computed for the range start; DST caveat documented). Revenue counts orders in `paid|processing|shipped|delivered`; refunds shown separately.
   Reports (route `/admin/reports/[report]`, one `ReportView` component: KPI cards with delta vs previous period, chart, table, CSV export):
   - `sales`: revenue, orders, AOV, units, tax, shipping; by day/week/month (`LineChart`).
   - `products`: top by units/revenue; margin when cost exists (`unit_cost_minor` snapshot); variant breakdown.
   - `categories`: revenue/units per category.
   - `payments`: by payment method (count, revenue, conversion of pending → paid); `shipping`: by method.
   - `taxes`: tax collected per rate per period (base + tax) — for accounting; `invoices`: issued/void counts and totals per series.
   - `inventory`: valuation at cost/retail, low/out of stock lists, **slow movers** (no sales in `slowMoverDays`), movement summary by reason.
   - `customers`: unique buyers (by email), new vs returning, repeat rate, top customers (orders, spent), by country/city.
   - `funnel`: page views → product views → add to cart → checkout started → orders → paid, conversion rates, top viewed products, traffic by device/country/referrer/UTM —
     last 90 days from Analytics Engine via `AnalyticsSqlQueryService` (`env.ANALYTICS_SQL.query({ query, params })` on `events.analyticsEngine."<dataset>"`),
     older periods from `daily_metrics`.
   - `notifications`: sent/delivered/read/failed per channel and template.
2. Job `analytics.daily_rollup`: yesterday's counts (AE + D1 orders) → upsert `daily_metrics`. Job `maintenance.purge`: notification log > 180 days, resolved failed jobs > 90 days.
3. Job `reports.weekly_summary`: last 7 days KPIs + top products + low stock → `weekly_report_store` (email; WhatsApp short version).
4. CSV endpoints `GET /api/admin/reports/[report].csv?...` reuse the same query method (no duplicated SQL).

Done when: every report renders on a phone with correct numbers against seed + test orders, deltas vs previous period work, CSV opens correctly in Excel/Sheets,
and the weekly summary arrives at the configured time.

### Stage 21 — Caching and performance

1. `page-cache` middleware (GET, no `key` param, store pages + `/sitemap.xml` + feed): key `https://page-cache.internal/<version><path><search>`; HIT/MISS header;
   store 200s with `s-maxage=300` via `caches.default.put` in `waitUntil`; never cache responses setting cookies. The `analytics` middleware runs BEFORE it, so page
   views are counted on hits. Inactive on `*.workers.dev` (documented).
2. Performance: LCP hero `fetchpriority="high"`; lazy images with width/height and correct `sizes`; islands `client:visible`/`client:idle`; one font; Pixel only after consent;
   JS budgets: listing < 30 KB gzip, product < 45 KB gzip.
3. Lighthouse mobile (home/shop/product): Performance ≥ 95, Accessibility ≥ 95, Best Practices ≥ 95, SEO 100, CLS < 0.05.

Done when: repeat visits HIT on a custom domain; admin saves cause a MISS; Lighthouse targets met.

### Stage 22 — SEO and i18n polish

Canonical + hreflang (`es`, `en`, `x-default`); localized titles; OG/Twitter; JSON-LD (`Organization` + `WebSite` SearchAction, `Product` + `Offer`/`AggregateOffer`,
`BreadcrumbList`, `LocalBusiness`; never mark Google reviews as own `aggregateRating`); `/sitemap.xml` with alternates (only indexable catalog URLs);
`/robots.txt` (disallow `/admin`, `/api`, `/checkout`, `/cart`, `/orders`); localized 404/500; dictionary audit.

Done when: sitemap validates; Rich Results shows Product; filtered URLs are noindex and absent from the sitemap.

### Stage 23 — Security hardening and observability

1. Headers: HSTS, nosniff, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()` (camera for the admin
   barcode scanner), CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`.
2. Every public mutation: `rateLimit` (+ `botCheck` for contact/checkout/login/forgot/stock-subscriptions); every admin endpoint: `auth`; body limits (JSON 64 KB,
   uploads 10 MB, CSV import 2 MB); webhooks (dLocal Go, PayPal, WhatsApp) verify signatures on the raw body; public order/invoice URLs require the key (constant time).
3. Escaping everywhere (Astro, micromark safe, template engine, CSV injection guard: prefix `'` when a cell starts with `= + - @`).
4. Structured logs (`http/log.ts`) in errors, webhooks, payments, jobs, notifications; Workers Logs on.
5. `docs/SECURITY.md` (threat summary + endpoint checklist).

Done when: headers check A or better; checklist complete.

### Stage 24 — Workers AI helpers (optional)

`"ai": { "binding": "AI" }`; `WorkersAiTranslator` (current translation-capable model, id in DECISIONS.md); "Translate ES → EN" (and reverse) on localized fields in
`SchemaForm`, `ProductEditor`, `EmailTemplateEditor`, WhatsApp bodies (mask `{{…}}` placeholders before translating, restore after);
`POST /api/admin/ai/translate` (`RL_API`, ≤ 5,000 chars). Never auto-save.

Done when: translating a product description or an email body fills the other tab with placeholders intact.

### Stage 25 — Multi-client deployment and provisioning

1. Finish `deploy-client.mjs` / `deploy-all.mjs` (section 2.3); deploy `demo`.
2. `docs/NEW_CLIENT.md` runbook: `npm run client:new -- <slug>` → edit `client.jsonc` → domain as zone in our account (or subdomain) → Turnstile widget →
   Email Service sending domain → client's dLocal Go/PayPal keys + webhooks → WhatsApp (WABA, phone id, token, webhook) and Meta Pixel/CAPI token (optional) →
   `.secrets/<slug>.json` → `npm run client:secrets -- <slug>` → `npm run deploy:client -- <slug>` → `/admin/setup` → rotate `SETUP_TOKEN` → settings, logo, products,
   WhatsApp templates submit/sync. **Own-account clients**: `accountId` + `.secrets/<slug>.env` token; same commands; their usage billed to them.
3. `docs/CUSTOMIZATION.md`: admin-level customization; `clients/<slug>/extensions` (widgets, CSS); new adapters (payment, legal invoicing, marketing sinks such as
   TikTok/Google) implement the existing ports + register in `create-app.ts`; update everyone with `git pull` + `npm run deploy:all`.
4. Capacity notes: 500 Workers, 1,000 KV namespaces, 10,000 queues, **250 cron triggers (one per client → max 250 clients with cron)**; shared quotas (emails,
   browser hours, Queues ops, D1/R2, Analytics Engine) and where to monitor them.
5. `README.md`: overview, stack, local setup, scripts, multi-client workflow, docs index.

Done when: `demo` + a second test client are deployed with `npm run deploy:all`, each isolated (own domain, data, admin, queue), and a full purchase works on both.

---

## 8. End-to-end verification (after Stage 25, on deployed previews)

1. `npm run check` + `npm run build` pass; no boundary violations.
2. Mobile (360×800), `/es` and `/en`: home carousel + animations; **filters**: every facet, counts, live "Ver N resultados", chips, canonical 301, noindex on filtered URLs;
   sort/search/pagination; variant picker; back-in-stock subscription; cart; checkout with all 5 payment methods; tax lines for included/excluded settings.
3. dLocal Go test payment → webhook → `paid` → invoice + PDF → `payment_confirmed` and `invoice_issued` by email **and WhatsApp** (opted-in) → Meta `Purchase` (deduplicated)
   → appears in reports. Expired session → cancelled + stock restored (ledger) + `order_cancelled`.
4. PayPal sandbox capture → `paid`; replayed webhooks cause no duplicates (payment events, notification idempotency keys, invoice uniqueness).
5. **Queues**: kill a provider (wrong token) → jobs retry with backoff → land in DLQ → visible in `/admin/jobs` → fix token → Retry succeeds once.
6. **Inventory**: two carts for the last unit → second fails; ledger shows every movement with correct `stock_after`; CSV import + export round-trip; low-stock alert once;
   back-in-stock notifications once; barcode scan on Android.
7. **Reports**: sales/products/taxes/inventory/customers/funnel numbers match test data; CSV exports open in Sheets; weekly summary delivered.
8. Admin from a phone: products, page builder, theme, email template edit + test, WhatsApp template submit/sync/test, order to delivered, invoice void.
9. Cache HIT/MISS behaviour; security (auth redirects, 429s, Turnstile, signature checks, keyed order/invoice URLs, CSP/headers).
10. Multi-client isolation (A never sees B's data, queue or analytics); `deploy:all` updates both; Lighthouse targets met.

---

## 9. Backlog (out of scope)

Certified e-invoicing adapters (DIAN, SAT, SUNAT…) and credit notes; customer accounts; coupons; regional taxes; multi-currency display; abandoned-cart flows
(email/WhatsApp); WhatsApp inbox/conversations; Instagram/Facebook Shop checkout; TikTok/Google Ads conversion sinks; wishlists; customer reviews; purchase orders
and suppliers; multi-warehouse stock; strict script-src CSP; automated tests; LatAm gateways (Wompi, Mercado Pago); single-Worker multi-tenant platform.
