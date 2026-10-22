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
- **Limit.** An order holds at most 30 lines: each line writes up to three rows. The cap is conservative: D1's documentation lists no maximum number of statements per batch (its 100 is bound parameters per query, which each statement here respects), so the real batch ceiling has not been measured. Raise it only after testing a large batch on a deployed Worker.
- **Shared code.** The WhatsApp link builder moved to `application/documents/whatsapp.ts`; `ui/lib/whatsapp.ts` re-exports it.
  `ui/i18n` gained `checkout.*` and `order.*` keys in both languages.
- **Open:**
  - Live Stripe and PayPal runs, and webhook endpoints registered with each provider.
  - A browser pass over the checkout form and the WhatsApp button.
  - A way to resume payment after leaving the provider page; today the order waits until its hold expires.
  - Refund events (Stage 16 admin refunds) and the handling of late payments on expired orders.
  - A failed notification stays `failed` while retries run, and the dead-letter queue does not update its log row (Stage 16).

## 2026-10-21 — Stage 11 (invoicing) — built, layout check pending

Stage 11 is not ticked. Every functional criterion passed locally. Two checks remain for a person: open a generated PDF to confirm
the layout and the VOID mark, and open an `invoice_issued` email to confirm the attachment. No PDF rasteriser is available in this
environment, so the document was not viewed.

- **Verified locally** (`astro dev`, local D1, Browser Run remote): a paid order issues `FV-000001` automatically. The totals match the
  order (1 200 with 192 tax inside the price). The PDF renders at 44 776 bytes, starts with `%PDF-`, and is stored at
  `invoices/<id>.pdf`. The `invoice_issued` email is sent. Two later paid orders get `FV-000002` and `FV-000003`, consecutive. A repeated
  payment event issues nothing more. The order page shows the invoice link, and the download returns the PDF with the access key.
  Voiding `FV-000003` sets `void`, records the reason, and clears the PDF. The next download renders again (45 486 bytes).
- **Numbering.** The series counter and the invoice row are one D1 batch, so a failed insert rolls the counter back and the series
  never skips a number. A second invoice for an order fails with CONFLICT, and the racing caller gets the existing invoice.
- **Snapshot.** The seller comes from the invoicing settings (legal name falls back to the store name). The buyer comes from the order.
  Lines come from the order items. The tax breakdown uses each line's rate. Shipping tax left over is shown at the default rate.
- **Automatic issuing and retries.** `ConfirmPayment` issues the invoice after the paid transition, for any paid event (issuing is
  idempotent). The event is now recorded last. If issuing fails, the webhook returns an error, the provider retries, and nothing is
  recorded as handled.
- **Email attachment.** Notifications queue a reference (`invoice_pdf`), not the bytes. `SendNotificationEmail` reads the PDF from R2 when
  the email is sent. A missing file means the email goes out without it. The `invoice_issued` copy now says the PDF is attached, and the
  button block is removed, since the customer has no link.
- **Legal hook.** `IssueLegalInvoice` is wired as the `invoice.legal_issue` job. The default `NoopLegalInvoiceIssuer` returns
  `not_applicable`; a certified provider replaces that adapter per country.
- **Void.** Only issued invoices of cancelled or refunded orders can be voided. The stored PDF is cleared, so the next download carries
  the void mark. There is no admin screen yet (Stage 16).
- **Shared rendering.** `storePdf` serves both the queued job and the customer download, so the two cannot drift apart.
- **Deviations from the plan.** The customer gets the PDF itself from `/api/orders/<n>/invoice.pdf`; the plan's HTML invoice page is not
  built, because the HTML is only ever printed. The `invoiceButton` block is gone.
- **Open:**
  - Open a generated PDF to check the layout and the VOID mark, and an `invoice_issued` email to check the attachment.
  - Admin issue, void, and resend screens (Stage 16).
  - A permanent failure while issuing (not a retry) keeps failing the webhook until it is fixed. A dedicated issuing job would avoid that.
  - A late payment on an expired order still issues nothing, as in Stage 10.
  - Certified e-invoicing providers (DIAN and the rest) stay in the backlog.

## 2026-10-21 — Stage 12 (content pages, contact, reviews)

- **Verified locally** (`astro dev`): the contact page renders in `es` and `en`: intro from the editable `contact` page, the contact
  details, the form, and the Turnstile widget. A valid message is stored in `contact_messages`. The store alert goes to the store email
  and the auto-reply to the sender; both are sent. A filled honeypot answers success and stores nothing. Invalid input answers 422.
- **Map.** The embed URL sits only in a data attribute. No iframe loads before the visitor clicks "Show map", and the facade disappears
  when the URL is empty. The click itself was not exercised in a browser.
- **Reviews.** A snapshot in KV renders: rating, a review, attribution, and the write-review link, when `showGoogleReviews` is on. When the
  flag is off, or the cache is empty, nothing renders. The `reviews.refresh` job fetches nothing without `GOOGLE_PLACES_API_KEY`
  and a Place ID.
- **Content pages.** `/<locale>/p/{about,privacy,terms,shipping-returns}` return 200 in both languages. Deviation: the plan named
  `/<locale>/about` and similar; those are served by the existing content route, so no extra routes were added.
- **Settings.** The seed has no `integrations` row, so the settings repository returns defaults. Not a bug. The admin settings screens
  (Stage 17) create the row. For tests, insert it with `json_object`: double quotes in a PowerShell `--command` string get mangled.
- **Not verified:** a real Places API call (no key or Place ID here), the map click in a browser, the scheduled review refresh, and
  Turnstile in a browser.

## 2026-10-21 — Stage 13 (admin foundation and authentication)

- **Verified locally** (`npm run dev`, curl, and one browser session on the sign-in, sign-out and reset-request forms):
  - Guards: `/admin` redirects to `/admin/login?next=…`; `POST /api/admin/*` answers 401 JSON. Admin responses are `no-store` and `noindex`.
  - Setup: a wrong `SETUP_TOKEN` gets 401; the right one creates the owner and sets the session cookie. Setup redirects to sign-in once an owner exists.
  - Sign-in: a wrong password gets 401, the right one 200. The sixth attempt within a minute for the same IP and email gets 429. The Turnstile widget produced a token in the browser and the sign-in went through.
  - Sign-out: the form post answers 303 and clears the cookie, and the old cookie is dead on the server.
  - Reset: the emailed link works once (a second use gets 409), resetting ends every session of the account, and the new password signs in.
  - Invitations: an owner's invite sends a link that forwards to the reset page. The invitee sets a password and signs in. An editor gets 403 on invite.
  - Sessions with less than 7 days left are extended to 14 days on use (checked in D1).
  - `next` stays inside `/admin`: a signed-in visit with `next=https://…` lands on `/admin`.
- **Passwords and tokens.** PBKDF2-SHA256, 100,000 iterations (the Workers maximum), 16-byte salt. New passwords need 12 characters or more. Session tokens are 32 random bytes in an HttpOnly cookie (`__Host-admin_session` on HTTPS, `admin_session` locally); D1 stores only their SHA-256. Reset links are valid for 30 minutes and invitations for 7 days (set in code; expiry itself was not tested). Both are single use.
- **Limits.** Sign-in is limited per IP and email (`RL_AUTH`) and needs Turnstile. Reset requests are limited per IP and need Turnstile, and they answer the same for known and unknown emails. First-owner setup is limited per IP, because `SETUP_TOKEN` is the only gate. The reset endpoint has no limit: the link carries 256 random bits and works once.
- **Owner-only invites** are enforced by `InviteAdmin` (`users.manage`), so the rule holds for any caller, not only for this endpoint.
- **Sign-out** is a plain form post that answers 303, so it works without JavaScript. `defineEndpoint` skips the body when an endpoint has no input schema, which makes that possible.
- **Language.** The admin UI follows each admin's own locale (the `admin` dictionary). Pages before sign-in use the store's default language.
- **Dev email.** The console sender now logs the text body, and the text part of every email keeps link addresses as `label (url)`. A plain-text reader could not reset a password without that, and the dev log could not show reset or invitation links. The console sender runs only with `EMAIL_TRANSPORT=console`.
- **Deferred from this stage** (plan items that need a list or a screen):
  - `ListToolbar`, `DataTable`, `StickySaveBar`, `ConfirmDialog` and `StatusBadge` come with the first admin list (Stage 14). The URL round trip for filters is not built yet.
  - Mobile bottom tabs and the `lg` sidebar. `AdminLayout` is a header with sign-out for now.
  - `ChangeOwnPassword` and `UpdateProfile` need a profile screen. The phone field waits for WhatsApp alerts (Stage 18).
  - An `auth` option on `defineEndpoint`. The middleware guards the routes instead.
- **Not verified:** email delivery through Cloudflare Email Service (the console sender was used), the admin screens at 360px, and the Turnstile widget on the storefront forms, which render their widget from inside the island the way the admin form first did and need a browser check.

## 2026-10-21 — Stage 14 (admin catalog and media)

- **Verified locally** (`npm run dev`, a Node script against the admin API with 38 checks, and the browser at 360px):
  - Media: the browser resizes each photo to the store widths (480, 960, 1600; WebP at 0.82, JPEG at 0.85 when WebP is not available). The server checks each size's bytes, and a stored size is served from `/media/…` as `image/webp`. An original narrower than 480px keeps its own width, so nothing is enlarged.
  - Products: one product with two attributes, six variants, four images and both languages saved in one request. The ledger holds one `initial` row per variant that starts with stock. The storefront lists it under the Red and S filters in English and Spanish, and both product pages render under their own slugs.
  - Stock: an edit applies only the difference from the stock the editor loaded, so a sale made while the editor was open is kept. Each manual change writes one `manual_adjust` row with the note.
  - Rules: a repeated SKU answers 409, a product without a name 422, an unknown category 422. An image, an attribute value or a category still in use cannot be deleted (409).
  - Browser: the upload from the media screen, the save from the phone-width editor (the saved product reloads with its name, slug, image and stock, and shows the saved notice), and the product list, categories and attributes screens with no console errors.
- **Decisions.**
  - A product save is one D1 batch. A variant that leaves the editor is deactivated, not deleted, because its ledger rows point at it.
  - The rule "a variant without attributes must be the only variant" counts active variants. A simple product can therefore become an attribute product: generating combinations deactivates its old variant. Keeping at least one variant active is also required.
  - Stock is the only part of a save that moves stock. The editor sends the stock it loaded (`stockBefore`), and only the difference is written to the ledger.
  - Products are archived, not deleted. `ProductRepository.delete` refuses a product that has stock history, and the admin screens do not expose delete.
  - The product list uses the storefront's search builder (`toPrefixQuery`), so search terms are sanitised the same way in both places.
  - Filters are GET parameters. The list works without JavaScript and a filtered view can be bookmarked. `ListToolbar` is that form; the URL hook from the plan is not needed for it.
  - Each size is a form field named `size-<width>`, which lets an original narrower than the store widths keep its own width. `defineEndpoint` gained `body: 'form'` for uploads and `invalidatesCache`, which bumps the page-cache version after an admin change.
  - The image library's "in use" check covers products, variants, categories and testimonials. It does not yet cover store settings (logo, favicon, social image); the settings screens in Stage 17 must add that check.
- **Deferred** (plan items for later stages or not needed yet):
  - Bulk set of price and stock across variants (plan item 4).
  - Category images, and alternative text for images: the data exists, no screen edits it yet.
  - Thumbnails in the product list: the list returns the image id, not its storage key.
  - Shared `ConfirmDialog` and `StickySaveBar` components: the editor has its own sticky save bar, and deletes use `window.confirm`.
  - Filter chips and the date range picker in `ListToolbar`: the reports screens (Stage 20) need them.
  - Mobile bottom tabs: the shell has a top navigation row for now.
- **Not verified:** a real phone (the browser used a 360px viewport), the variant grid with six generated combinations in the browser (the same rule was exercised through the API), the storefront product page layout beyond status and name, and Cloudflare R2 (local emulation only).
- **Test data.** The local database now holds the products, categories, attributes and images from the smoke runs. Their names and SKUs carry a per-run suffix. Clear them before any demo.

## 2026-10-21 — Stage 15 (inventory module)

- **Verified locally** (`npm run dev` against the local D1, two scratch scripts outside the repo: 36 and 6 checks, all passing):
  - Manual adjustments, the CSV import and a sale all reach the ledger. Every row's `stock_after` equals the running total of the deltas up to it, and the last row is the stock on record.
  - Low stock: crossing the line queued one `low_stock_store` message. Repeats on the same UTC day added none, and the message reached `sent` in the notification log.
  - Back in stock: a subscriber to a sold-out variant got one `back_in_stock` message at the restock. A second restock told nobody again, because the subscription was already marked as told.
  - Expired order: the scheduler cancelled it, gave its unit back as a `cancel_restore` row, and the stock on record matched that row.
  - CSV import: the preview changed nothing and reported an unknown SKU with its reason. The import applied the valid row and set its unit cost from the `cost` column.
  - Barcode and SKU lookups open the right variant; an unknown code answers 404. A repeated variant and a negative count are refused with 422.
  - The two admin pages answer 200 for every filter combination tried, including malformed ones. The dev log shows no errors.
  - `npm run check` and `npm run build` pass.
- **Decisions.**
  - Every producer of stock changes returns what it changed: order placement, cancellations (expiry and payment failure), manual adjustments, imports and product saves. `EvaluateStockChanges` is the one place that turns those changes into alert jobs. `place()`, `cancelAndReleaseStock()`, `adjust()` and product saves report their changes, taken from the batch itself: the ledger insert has `RETURNING`, and `stockChangesFrom` reads the results of `db.batch` (the slot of each ledger statement comes from `addStockChange`). There is no follow-up read, so a concurrent sale cannot change what was reported (verified in SQLite: two sales report 4 to 3 and 3 to 2). `EvaluateStockChanges` never throws: the stock change is already committed, so a failure to queue alerts is logged (`inventory.alerts_failed`) and must not fail the sale, cancellation or adjustment.
  - A variant without its own threshold keeps `null`, and `EvaluateStockChanges` applies the store default. It is the only place that does.
  - Alerts are jobs and are never sent inline. One low-stock job carries every variant an operation pushed to its line, so an import that crosses a hundred lines sends one email with a table (the email plan is shared by all clients). A variant alerts at most once per UTC day, as the plan says: a KV marker `inventory:low-stock:<variant>:<day>` (2-day TTL) is checked before queuing. A back-in-stock message is keyed by variant and restock time, so each restock tells each subscriber once.
  - Back-in-stock subscriptions take only sold-out variants. Repeating a request refreshes it, and the response is the same either way, so it never shows whether an address already subscribed. The bot check and the `forms` rate limit apply.
  - Manual changes are batches of up to 50 variants, one D1 batch each. A counted value ("set") becomes a difference from the stock the admin was looking at (`expected`, sent by the screen), the same rule as the product editor, so a sale made while the form was open is kept. Without `expected` the stock on record at submit time is used.
  - CSV: the header must name `sku`, `mode` and `quantity`. `cost` and `note` are optional, and other columns are ignored. The delimiter is read from the header line (comma, or semicolon as Excel saves it in Spanish). A file holds at most 2 MB and 400 rows (a row costs two statements; D1's limits page lists 1,000 queries per invocation on the paid plan, the Workers page 10,000 subrequests, so 400 stays under the stricter figure), and each SKU may appear once. Rows apply in batches of 50 under one import id. Each batch commits on its own: a batch that fails reports its rows as errors and the others stay applied, so the admin must import only the failed rows, never the whole file again (that would apply the "add" rows twice). The summary is always returned.
  - The export is a count sheet: mode `set`, the stock on record and the cost, so it imports back unchanged. Untracked variants are left out. Cells that start with `= + - @` get a leading `'` (the import removes it again), and files start with a UTF-8 byte-order mark. An export always starts at the first row of its filter, whatever page the link came from.
  - Inventory lists only active variants. A variant removed in the product editor is deactivated (its ledger rows must survive), and it is not listed, counted, scanned, adjusted or offered for back-in-stock. The ledger still shows its history.
  - The ledger's date filters follow the store time zone (`domain/shared/day-bounds.ts`), not the UTC day, and compare timestamp ranges so the `created_at` index is used.
  - Lists find the page's ids first (variant and product tables only, with the count in the same `db.batch`), then load names, labels and thumbnails for those rows alone. Every sort ends with a unique column. Search text is escaped for `LIKE`. The shared SQL (translated names, variant label, text search, `WHERE` assembly) is in `d1/sql-fragments.ts`; the admin product list uses it too.
  - Messages the use cases return for display are codes: `ImportRowCode` for import rows, `StockProblem` for refused adjustments (in `details.reason`). The screens translate them (`admin.inventory.problems`, `admin.inventory.csv.codes`). One domain function, `planStockChange`, turns "add" or "set" into a delta or a problem; reasons and statuses are `as const` lists in the domain.
  - The queue adapter splits `enqueueMany` into calls of at most 100 messages and about 250 KB, so callers pass any number of jobs. A variant is marked as alerted for the day only after its alert is queued.
  - A unit cost in an import row is saved in the same batch as its stock change. Products that are drafts or archived take no back-in-stock subscriptions and send no alerts. The write repository is not on the container: pages change stock only through the use cases.
  - The preview runs on the server with the import's own parser, so the preview and the import cannot disagree. The plan had the preview in the browser; one copy of the rules is simpler.
  - Barcodes: where the browser has `BarcodeDetector` (Chrome on Android), the camera reads EAN, UPC, Code 128 and 39, and QR codes. Typed codes work everywhere. A decoded code is looked up as a SKU or barcode, so a QR code that holds a URL is not parsed.
  - Totals count every tracked variant (stock on hand), not only the sellable ones.
  - Store alerts go to the order notification address, falling back to the contact address. The alert channel list is read, but only e-mail is sent until WhatsApp joins in Stage 18.
  - Shared code: `http/list-query.ts` holds the page number and list links used by products and inventory. `ui/styles/admin-table.css` is global, so the Preact tables get the card layout. `StatusBadge` uses the shared badge classes. The islands fill `{placeholders}` with a one-line helper instead of importing `ui/i18n`, which would bundle both dictionaries into the browser.
- **Deferred.**
  - The storefront back-in-stock form on the product page (a Stage 7 item). `POST /api/stock-subscriptions` is in place and tested; the form and its strings wait for the storefront pass.
  - WhatsApp alerts for low stock and back in stock (Stage 18). Subscriptions already store the phone number and the opt-in.
  - The dashboard counts of low and sold-out variants (Stage 16).
- **Not verified.**
  - Barcode scanning with a camera: no Android phone was used. The lookup the scanner calls was verified with the same request.
  - The inventory screens at 360px in a browser. They reuse the admin card layout that the product list uses.
- **Size.** `create-container.ts`, `order-repository.ts` and the two dictionaries are above the 250-line guideline. The first two were already above it, and the dictionaries grew with each stage. Splitting them is a separate change.

## 2026-10-21 — Review of stages 0 to 15 (fixes and open items)

An independent review of every logged decision and of the Stage 15 work found the items below. The Stage 15 fixes are described in that stage's entry.

- **Invoices are issued by a job, not inside the payment webhook** (`invoice.issue`, payload `{ orderId }`, idempotency key `invoice-issue:<orderId>`). `ConfirmPayment` queues it after the `paid` transition. Before, a persistent issuing failure failed the webhook, so Stripe would retry and eventually disable the endpoint and no payment would be confirmed. Now the queue retries with backoff and the dead-letter queue keeps the job. This replaces the Stage 11 note "issuing failure fails the webhook" and closes its open item about a dedicated issuing job. Issuing stays idempotent, so a repeat finds the existing invoice.
- **The invoice email no longer depends on who stored the PDF.** `RenderInvoicePdf` used to return as soon as the invoice had a PDF key. When a customer's download stored the PDF before the queued job ran (the PDF render is a remote call, so the order varies), the job exited and the `invoice_issued` email was never queued. Seen once in a smoke run: the invoice had its PDF, no email row and no failed job. The job now renders only when the PDF is missing and always queues the email for an issued invoice; the notification key is built from the invoice id, so repeats queue nothing. The race was not reproduced afterwards (three clean runs, two under load); the cause comes from the code and the database state.
- **PayPal accepts MXN** besides USD and EUR (two decimals, as PayPal expects). COP, PEN, CLP and ARS are not PayPal currencies and still hide PayPal at checkout.
- **Stripe full refunds mark the order refunded.** `charge.refunded` carries a charge and payment intent, while orders store the Checkout session id, so the adapter asks Stripe for the session of that payment intent (`GET /v1/checkout/sessions?payment_intent=…`; a failed lookup answers an error and Stripe retries). Only a fully refunded charge (`refunded: true`) counts; `ConfirmPayment` still checks the amount against the order total. A partial refund leaves the order paid for the store to settle by hand. **Not tested against Stripe**: the mapping was type-checked and the route exercised locally with no API key, so the first real refund in test mode should be watched. The admin refund screen stays in Stage 16.
- **Order link in later emails (open).** Shipped and delivered emails cannot carry the order link, because only the key's hash is stored. A signed, expiring link (HMAC of the order id with a server secret) would fix that without storing the key. Decide before Stage 16 sends those emails.
- **Back-in-stock form.** The subscription endpoint exists; the form on the product page belongs to Stage 7 and is still unbuilt.
- **Stage ticks.** Stages 5 and 6 were ticked while a "Done when" item was still unverified: the retry and dead-letter paths (5) and the 360 px storefront check (6). They are now unticked until those are exercised. Stage 13's filter round trip through the URL was delivered by Stage 14 (filters are GET parameters), so it stays ticked.
- **Files over 250 lines** (rule in CLAUDE.md) were split: the catalog read model (`catalog-*.ts`), the container (`container.ts`, `identity.ts`, `ordering.ts`), the order repository (`order-mapper.ts`, `order-statements.ts`), `place-order-support.ts`, `paypal-support.ts`, the checkout form (`CheckoutAddressFields`, `CheckoutSummary`, `checkout-support`), the email definitions and the widget registry. Left as they are: the two dictionaries (data that grows with every screen), and two files a few lines over (`CheckoutForm.tsx` 258, `inventory-queries.ts` 252).
- **Known limits.** The low-stock "alerted today" marker and the alert day use the UTC day. D1's batch size ceiling is not documented, so the 30-line order cap and the 400-row import cap are conservative guesses to measure on a deployed Worker.
