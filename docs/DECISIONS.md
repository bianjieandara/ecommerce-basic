# Decisions log

Short ADR-style entries: date, decision, reason. Add an entry whenever a dependency is added,
an external API behaves differently from the plan, or a plan item is changed.

## 2026-10-21 — Stage 0

- **Astro 7 (latest stable)** instead of the Astro 5 pattern in older docs. Reason: plan says "latest stable".
- **Cloudflare adapter with `imageService: "passthrough"`**. Reason: we resize images in the browser, so no paid transforms.
- **Tailwind v4 through `@tailwindcss/vite`**. Reason: plan styling decision; no PostCSS config needed.
- **`@client` alias falls back to `clients/_default/extensions`** when the active client has no folder.
- **Layer boundary rule also blocks `ui`, `pages` and `clients` from importing `composition`**. Reason: the plan says UI never
  imports composition (section 2.1). The lint rule enforces it.
- **Pre-scripts (`predev`, `prebuild`) that call `scripts/use-client.mjs`** were added in Stage 1, once the script existed.
- **Stage 0 root route is a plain `ok` endpoint** (`src/pages/index.ts`). Replaced in Stage 7.
- **`@types/node` added as a dev dependency**. Reason: `astro.config.mjs` uses `node:fs` and `process.env`; without the types
  `astro check` fails. Type definitions only, no runtime code.

## 2026-10-21 — Stage 1

- **Custom Worker entrypoint is `src/worker.ts`**. It wraps `handle` from `@astrojs/cloudflare/handler` (adapter 14) and adds
  `queue` and `scheduled`. Reason: the adapter builds its own entry, and the default one has no queue or cron handlers.
  Importing `dist/` from `src/` was rejected: it breaks the type check and the build before the first `astro build`.
- **Compatibility date `2026-10-19`** instead of today's date. Reason: the local workerd binary supports up to 2026-10-19;
  a newer date stops `astro dev`.
- **`wrangler.base.jsonc` keeps placeholders**; `scripts/use-client.mjs` writes the root `wrangler.jsonc` (gitignored) for the active client.
- **Dev uses remote bindings** (Browser Run and Analytics SQL). `astro dev` connects to Cloudflare at startup; this is expected.
- **R2 bucket is pending.** The account does not have R2 enabled yet (Cloudflare error 10042). Enable R2 in the dashboard, then run
  `npx wrangler r2 bucket create demo-media`. `scripts/new-client.mjs` creates R2 last and prints this instruction if it fails.
- **Resource creation is idempotent.** D1 and KV are found by name before creating; queues treat "is already taken" as success.
- **`.dev.vars` is copied from `.dev.vars.example`** for local runs; it is gitignored.
- **`wrangler.base.jsonc` and `clients/*/client.jsonc` use trailing commas**, which Wrangler accepts.

## 2026-10-21 — Stage 2

- **Money, tax and totals are integer maths in the domain layer.** `computeLineTax` rounds half up with integers; `computeOrderTotals`
  is the one function used by quotes, checkout, gateways and invoices.
- **Catalog options are passed in, not read from settings.** `parseCatalogQuery` and `catalogQueryToSearchParams` take the currency
  exponent and default sort. The domain never reads settings, so the same function runs in pages, the count API and tests.
- **Dictionaries are typed against `en`.** `es.ts` uses `Dictionary = typeof en`, so a missing Spanish key fails `npm run check`.
- **Missing translation keys render as the key** (visible gap, no crash).
- **Intl formatting lives in `domain/shared/format.ts`** and the UI re-exports it. Verified: a USD price in `es-CO` renders as `US$ 12,50`.
- **Pages must send a charset.** The dev server sends `text/html` without `charset`. The Stage 6 base layout adds
  `<meta charset="utf-8">` and the server keeps UTF-8 output.

## 2026-10-21 — Stage 3

- **Schema is the plan's final version** (`0001_initial.sql`): `notification_log` replaces the earlier `email_log`, and
  `whatsapp_templates`, `failed_jobs` and `daily_metrics` are included from the start.
- **Seed is idempotent only on a fresh database.** Re-running `db:seed:local` inserts duplicates. Reset with
  `Remove-Item -Recurse .wrangler/state`, then migrate and seed again.
- **Verified counts:** 12 products, 20 variants (10 apparel, 10 simple), 24 translations, 24 search rows, 16 "initial" ledger rows
  (the 4 variants with zero stock produce none). FTS prefix search `camiseta*` returns the product.

## 2026-10-21 — Stage 4

- **Ports are written for the stages that use them.** Written now: platform, jobs, payments, catalog, inventory, ordering, invoicing,
  notifications, content, identity, media. Deferred: `whatsapp` (Stage 18), `marketing`, `analytics` (Stage 19), `reports` (Stage 20),
  and the admin list query types (Stages 14 to 16). The plan listed them all here; writing them now would only guess at shapes.
- **`fieldsToSchema(fields, { defaultLocale })`** takes the default language. Required localized fields apply only to that language,
  as the plan states.
- **Widget definitions live in one file** (`application/content/widgets/registry.ts`) instead of one file per type. They are typed
  the same way. Client extensions are merged in the UI layer (Stage 7), so `application` never imports `@client`.
- **Settings field descriptors per group are deferred to Stage 17**, when the settings forms are built. The zod schemas with defaults
  exist now and are what validates stored values.
- **Legal texts are templates.** Placeholders are filled by `fillPlaceholders`. They must be reviewed by the client's lawyer before go-live.
- **Job payload schemas (zod) are deferred to Stage 5**, with the job dispatcher that uses them.
- **Verified:** `npm run check` and `npm run build` exit 0; ESLint reports no layer-boundary violations.

## 2026-10-21 — Stage 5

- **Container instead of `createApp`.** `composition/create-container.ts` returns one object with settings, the job queue,
  the dispatcher, the scheduler, platform adapters and a health check. Routes read it from `Astro.locals.app`.
- **Custom entrypoint calls the container.** `src/worker.ts` forwards queue batches to `jobs.consumeBatch` and cron ticks to
  `scheduler.onTick`. Verified locally: a valid job is acknowledged (`job.done`), an invalid job lands in `failed_jobs`, and a
  cron tick enqueues the periodic jobs.
- **Not yet exercised:** the `RetryableError` retry path and the dead-letter batch. The code is written; a test needs a handler
  that fails on purpose, and no such route exists outside development.
- **Only two repositories exist:** settings and failed jobs. Products, orders, invoices and the rest come with their stages (7, 10,
  11, 14 to 17). The plan lists them under this stage; writing them now would guess at queries the later stages define.
- **`JOBS_MODE=inline` is not implemented.** Local development uses the real queue through `astro dev`, which the adapter
  supports, so an inline fallback is not needed.
- **`defineEndpoint` supports public GET and POST only.** Admin auth, rate limits and bot checks arrive in Stages 13 and 23.
  Responses are `{ ok: true, data }`, so `/api/health` returns `{ ok, data: { ok, d1 } }`.
- **Pdf renderer is typed but unverified.** `BrowserRunPdfRenderer` uses `format: 'a4'` (lowercase, required by the generated types).
  It runs for real in Stage 11.
- **Known gap:** `D1FailedJobRepository.record` reads the time with `new Date()` instead of the Clock port. Fix in Stage 16 with the
  failed-jobs admin page.

## 2026-10-21 — Stage 6

- **Verified:** `npm run check` and `npm run build` exit 0. The UI kit page (since removed) rendered every primitive, the chart SVGs,
  the drawer, the toast region, the hreflang links and the theme variables.
- **Not yet verified:** the 360 px layout (no horizontal scroll) and the carousel/drawer behaviour in a browser. Check on a phone or
  with Chrome DevTools device mode before Stage 7 is signed off.
- **Components are split by file, with two merges:** `Field` wraps any control, and `Input` renders input, select or textarea. The
  empty state, skeleton, badge and rating are separate files. The plan listed separate Checkbox, Select and Textarea files; the
  merged `Input` keeps the same attributes.
- **No Admin layout yet.** `AdminLayout` and `AuthLayout` belong to Stage 13, as the plan says.
- **Toaster is the only island in this stage** (`client:idle`). Charts are server-rendered SVG with a text list for screen readers.
- **Fonts:** all three @fontsource stylesheets are imported. The browser downloads a font file only when text uses it, so the
  unused presets cost nothing on the wire.
- **Cart badge** (`data-cart-count`) exists in the header but has no data until Stage 8 fills it from the cart store.

## 2026-10-21 — Cloudflare account for eBAQ

- **Hosting account is `bianjieandara@gmail.com` (`ec9019b98b852dc29c0d43042d3ad8bf`).** R2 was not enabled on the first account
  (`ebaq.solutions@gmail.com`, `35dacd…`), so `demo` was re-provisioned here: D1 `demo-db`, KV `demo-cache`, queues `demo-jobs` and
  `demo-jobs-dlq`, R2 `demo-media`. `clients/demo/client.jsonc` pins `accountId`.
- **Resources left in the first account (`35dacd…`) are unused.** Delete them in its dashboard when convenient.
- **The dress-rental `.env` token was not used.** Verification returned 401 (invalid token) and the account ID does not match.

## 2026-10-21 — Stages 7 and 8 (in progress)

- **Stage 7 status: partial.** Built and checked over HTTP in dev: `/` (302 to the language), `/es/` home sections, `/es/shop`
  (filters, sort, pagination, counts), `/es/shop/<category>`, `/es/products/<slug>` with `?v=` option links, `/es/p/<slug>`
  content pages, `/media/<key>`. Canonical redirects return 301 (`?category=` moves to the path, unknown params are dropped),
  filtered URLs are `noindex`, unknown slugs return 404.
  **Not built yet:** the live result counter (`GET /api/catalog/count`), search suggestions, related products, and category
  pages' language switch (the category slug differs per language; it needs a lookup by category id).
- **Stage 8 status: implemented, browser behaviour not verified.** `POST /api/cart/quote` re-prices a cart on the server. Checked:
  2 units of a 2 500 product give subtotal 5 000, tax 798 included, total 5 000; out-of-stock and unknown variants are flagged
  unavailable; a quantity of 100 returns 422. The cart lives in `localStorage` (`cart:v1`); `AddToCart`, `CartBadge`, `CartDrawer`
  and `CartPage` are Preact islands. **Not verified in a browser:** add, change, remove, reload persistence, price-change notice.
  The browser tool could not load localhost (error page on both `localhost` and `127.0.0.1`), although the server answers.
- **Shipping in the cart is an estimate.** Shipping options come from the quote, but the chosen method is decided at checkout (Stage 10).
- **Default home content** now includes trust badges and a WhatsApp block, so the home page is complete without admin edits.
- **Widget renderers still missing:** `promo_banner`, `testimonials`, `image_gallery` and `faq` render nothing. Images in the hero and
  category grid are not shown until the media lookup by id exists (Stage 14).

## 2026-10-21 — Stage 9

- **Queue first, send later.** `NotificationService.notify()` only writes a `notification_log` row and enqueues `notify.email`.
  The row key is `<key>:<reference>:email:<address>` with `ON CONFLICT DO NOTHING`, so repeating a reference queues nothing.
  A missing or malformed address is logged as `skipped` before anything is queued. Checked: same reference twice gives one row.
- **Delivery.** `SendNotificationEmail` renders the admin override or the code default, sends through the `EmailSender` port and
  records `sent` (with subject and provider id). A send error is logged as `failed` and rethrown, so the queue retries it.
  When retries run out the job lands in `failed_jobs`, but its log row stays `failed`/`queued` until Stage 16 links the two.
- **Transport.** `EMAIL_TRANSPORT` (wrangler vars, default `cloudflare`) picks the `EMAIL` binding. `.dev.vars` sets `console`,
  which logs instead of sending. Production must never set `console`.
- **Template syntax.** `{{path}}` inserts an escaped value (braces are escaped too, so data cannot form placeholders),
  `{{#if path}}…{{else}}…{{/if}}` for optional text (one level, no nesting) and `{{block:name}}` for whitelisted blocks.
  **Deviation:** the plan wrote `{{> name}}`, but micromark encodes `>` in text, so that tag would never match after Markdown.
  Markdown is rendered first with raw HTML off; values are inserted afterwards, so customer text is never read as Markdown.
- **Validation.** `validateTemplate` rejects unknown variables and blocks, unbalanced or nested conditionals, unknown tokens,
  multi-line subjects over 200 characters and bodies over 20 000. Saves check both languages; previews check drafts
  (`/dev/emails/<key>?subject=…&body=…` answers 422 with the problems). Checked: unknown variable, unknown block, `{{> x}}`, nesting.
- **Blocks.** Thirteen blocks: `orderItems`, `orderTotals`, `shippingAddress`, `bankInstructions`, `orderButton`,
  `invoiceButton`, `resetButton`, `inviteButton`, `productButton`, `reportButton`, `contactMessage`, `lowStockTable`, `kpiTable`.
  Each button is its own block so its label comes from `documents/email-labels.ts` in the recipient's language.
  The plan's `trackingInfo` and `whatsappButton` are not needed: the shipped email uses a conditional and WhatsApp comes in Stage 18.
- **Definitions.** Sixteen, one per `NotificationKey`, grouped as customer, store and admin under `notifications/email/`. A missing key
  fails type-checking (`email/index.ts`). Each lists the variables and blocks it may use; `store.*` is allowed everywhere.
- **Context.** Producers pass already-formatted text, so templates contain no formatting. `NotificationService` adds the store
  section from settings. `sampleSections()` gives every variable a realistic value for previews and test sends.
- **Email shell.** Table layout, inline styles, 600 px wide, preheader, plain-text version from `htmlToText`. No logo yet
  (`logoUrl: null`); it needs the media lookup (Stage 14).
- **Channels.** Email only. WhatsApp joins `NotificationService` in Stage 18 (template approval and opt-in).
- **Deferred.** `documents/csv.ts` lands with the first CSV export (Stage 15). `documents/invoice-document.ts` is Stage 11.
  Send-test and the log list use case come with the admin screens (Stage 17); the repository `list()` already exists.
- **Shared code.** `renderMarkdown` now lives in `application/documents/markdown.ts`; `ui/lib/markdown.ts` re-exports it, so content
  pages and email templates use the same settings.
- **Fixed on the way.** A comment in `create-container.ts` had lost the `n` of `newDays` (a `\n` had been written); repaired.
- **Dev-only routes.** `/dev/emails/<key>?locale=` renders a preview; `/dev/notify?key=…` queues a sample (`reference` and `to` are
  optional). Both return 404 unless `import.meta.env.DEV`.
- **Verified in `astro dev`.** All 16 emails render in `es` and `en` (32 of 32) with no leftover syntax. `/dev/notify` produces a
  `queued` row, the queue consumer sends it and the row becomes `sent` with the console message id. `npm run check` has 0 errors and
  `npm run build` passes.
- **Not exercised.** A failing send and its retry path: the console transport never fails. That path is code-reviewed only.
- **Still open from earlier stages.** `D1FailedJobRepository.record` uses `new Date()` instead of the clock port. Stage 7's live counter,
  suggestions, related products and category language alternates remain unbuilt.

## 2026-10-21 — Stage 10 (checkout, orders, payments) — partial

Stage 10 is not ticked: its "Done when" needs live Stripe and PayPal sandboxes, and no keys are available here.

- **Verified locally** (`astro dev`, local D1): a bank-transfer order with flat shipping stores 2 000 + 800 shipping, with 319 tax
  already inside the price. Stock goes 30 → 28 with a `sale` ledger row (`stock_after` 28). Both notifications are queued, then sent.
  A sold-out line returns `PRODUCT_UNAVAILABLE` (409). An unconfigured method returns `PAYMENT_METHOD_UNAVAILABLE` (422).
  WhatsApp pickup builds the `wa.me` link with the order number. The scheduled tick cancels an expired order and restores stock
  (`cancel_restore` +2, `stock_after` 30, `stock_released` 1). A correctly signed Stripe `checkout.session.completed` marks the
  order paid and sends one confirmation. The repeat is acknowledged with no second effect, and a bad signature gets 400.
  The order page shows in `es` and `en` with its key and returns 404 without it. Checkout and order pages send `no-store`.
- **Not verified:** Stripe and PayPal against their real APIs (session creation, order creation, capture, and webhook verification
  with live keys). The checkout form in a browser: the browser tool cannot load localhost, so only the HTML and the API are checked.
- **Bug found and fixed.** `TurnstileVerifier` stored the global `fetch` as a field and called it as a method. The Workers runtime
  throws "Illegal invocation" for that, and the verifier's `catch` turned it into a silent `false`, so every checkout failed with
  `BOT_CHECK_FAILED`. The fix is `infrastructure/system/http-fetch.ts`, used by the verifier and by both payment adapters. Do not
  store `fetch` as a field anywhere.
- **Stock and money in one batch.** `stock-ledger.ts` builds each stock update together with its ledger row. Placement is one batch
  that counter, order, items, stock and ledger all share, so a CHECK failure rolls the whole order back as `OUT_OF_STOCK`.
  Cancellation guards every statement on `status` and `stock_released`, then flips the order to `cancelled` last, so the guards see
  the starting state. A repeated cancel changes nothing.
- **Guarded transitions.** `transition(id, from, to)` and `cancelAndReleaseStock(id, from)` apply only while the order is still in
  `from`. So the expiry job cannot cancel a paid order, and a late webhook cannot revive a cancelled one. Late payments for expired
  orders are logged as events only; the store handles them by hand (admin, Stage 16).
- **Access key.** 32 random bytes, shown once in the order link. Only the SHA-256 is stored, compared in constant time. Later
  messages carry no order link because the key is not stored; `orderSections` leaves the button out when the link is empty.
- **Webhooks.** Stripe signatures use HMAC-SHA256 over the raw body, with a 300-second window. PayPal events are checked through
  its verify API. Each provider event id is recorded once (`payment_events`). An amount or currency mismatch throws before the event is
  recorded, so the provider retries it.
- **Stripe without the SDK.** Two REST endpoints and one signature check are small enough to write directly. The plan named the SDK;
  this is a deliberate deviation. The bank-debit events (`async_payment_*`) are handled; refund events are not yet.
- **PayPal currencies.** Only USD and EUR orders can use PayPal. The settlement-currency and exchange-rate settings are stored but not
  used, because a converted capture would not match the order's currency check. Designing that conversion is a later decision.
- **Quote and checkout share totals.** `QuoteCart` takes the chosen shipping method, so the cart summary matches the order.
  It also returns only the methods the gateways accept (`availablePaymentMethods`). Order items snapshot SKU, cost and tax rate.
- **Limit.** An order holds at most 30 lines: each line writes up to three rows, and a D1 batch takes 100 statements.
- **Shared code.** The WhatsApp link builder moved to `application/documents/whatsapp.ts`; `ui/lib/whatsapp.ts` re-exports it.
  `ui/i18n` gained `checkout.*` and `order.*` keys in both languages.
- **Open:**
  - Live Stripe and PayPal runs, and webhook endpoints registered with each provider.
  - A browser pass over the checkout form and the WhatsApp button.
  - A way to resume payment after leaving the provider page; today the order waits until its hold expires.
  - Refund events (Stage 16 admin refunds) and the handling of late payments on expired orders.
  - A failed notification stays `failed` while retries run, and the dead-letter queue does not update its log row (Stage 16).
