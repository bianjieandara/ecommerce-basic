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

Stage 10 is not ticked: its "Done when" needs live card-gateway and PayPal sandboxes, and no keys are available here.

- **Verified locally** (`astro dev`, local D1): a bank-transfer order with flat shipping stores 2 000 + 800 shipping, with 319 tax
  already inside the price. Stock goes 30 → 28 with a `sale` ledger row (`stock_after` 28). Both notifications are queued, then sent.
  A sold-out line returns `PRODUCT_UNAVAILABLE` (409). An unconfigured method returns `PAYMENT_METHOD_UNAVAILABLE` (422).
  WhatsApp pickup builds the `wa.me` link with the order number. The scheduled tick cancels an expired order and restores stock
  (`cancel_restore` +2, `stock_after` 30, `stock_released` 1). A correctly signed completion event of the first card gateway marks the
  order paid and sends one confirmation. The repeat is acknowledged with no second effect, and a bad signature gets 400.
  The order page shows in `es` and `en` with its key and returns 404 without it. Checkout and order pages send `no-store`.
- **Not verified:** the first card gateway and PayPal against their real APIs (session creation, order creation, capture, and webhook verification
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
  messages cannot carry that key because it is not stored, so they carry the email key instead (see the review entry below);
  `orderSections` leaves the button out when the link is empty.
- **Webhooks.** The first card gateway's signatures use HMAC-SHA256 over the raw body, with a 300-second window. PayPal events are checked through
  its verify API. Each provider event id is recorded once (`payment_events`). An amount or currency mismatch throws before the event is
  recorded, so the provider retries it.
- **The first card gateway without its SDK.** Two REST endpoints and one signature check are small enough to write directly. The plan named the SDK;
  this is a deliberate deviation. The bank-debit events (`async_payment_*`) are handled; refund events are not yet.
- **PayPal currencies.** Only USD and EUR orders can use PayPal. The settlement-currency and exchange-rate settings are stored but not
  used, because a converted capture would not match the order's currency check. Designing that conversion is a later decision.
- **Quote and checkout share totals.** `QuoteCart` takes the chosen shipping method, so the cart summary matches the order.
  It also returns only the methods the gateways accept (`availablePaymentMethods`). Order items snapshot SKU, cost and tax rate.
- **Limit.** An order holds at most 30 lines: each line writes up to three rows. The cap is conservative: D1's documentation lists no maximum number of statements per batch (its 100 is bound parameters per query, which each statement here respects), so the real batch ceiling has not been measured. Raise it only after testing a large batch on a deployed Worker.
- **Shared code.** The WhatsApp link builder moved to `application/documents/whatsapp.ts`; `ui/lib/whatsapp.ts` re-exports it.
  `ui/i18n` gained `checkout.*` and `order.*` keys in both languages.
- **Open:**
  - Live card-gateway and PayPal runs, and webhook endpoints registered with each provider.
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
- **Deviations from the plan.** The customer gets the PDF itself from `/api/orders/<n>/invoice.pdf`; the plan's HTML invoice page is also
  built, at `/<locale>/orders/<n>/invoice?key=` (see 2026-10-22). The `invoiceButton` block is gone.
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

- **Invoices are issued by a job, not inside the payment webhook** (`invoice.issue`, payload `{ orderId }`, idempotency key `invoice-issue:<orderId>`). `ConfirmPayment` queues it after the `paid` transition. Before, a persistent issuing failure failed the webhook, so the gateway would retry and eventually disable the endpoint and no payment would be confirmed. Now the queue retries with backoff and the dead-letter queue keeps the job. This replaces the Stage 11 note "issuing failure fails the webhook" and closes its open item about a dedicated issuing job. Issuing stays idempotent, so a repeat finds the existing invoice.
- **The invoice email no longer depends on who stored the PDF.** `RenderInvoicePdf` used to return as soon as the invoice had a PDF key. When a customer's download stored the PDF before the queued job ran (the PDF render is a remote call, so the order varies), the job exited and the `invoice_issued` email was never queued. Seen once in a smoke run: the invoice had its PDF, no email row and no failed job. The job now renders only when the PDF is missing and always queues the email for an issued invoice; the notification key is built from the invoice id, so repeats queue nothing. The race was not reproduced afterwards (three clean runs, two under load); the cause comes from the code and the database state.
- **PayPal accepts MXN** besides USD and EUR (two decimals, as PayPal expects). COP, PEN, CLP and ARS are not PayPal currencies and still hide PayPal at checkout.
- **Full refunds of the first card gateway marked the order refunded.** Its refund event named a charge and a payment intent, while orders stored the checkout session id, so the adapter looked up the session of that payment intent (a failed lookup answered an error and the gateway retried). Only a fully refunded charge counted; `ConfirmPayment` still checks the amount against the order total, and a partial refund leaves the order paid for the store to settle by hand. It was never tested against the live API. The adapter has since been replaced by dLocal Go's, which handles refund notifications itself. The admin refund screen stays in Stage 16.
- **Emails after checkout carry an order link.** The checkout key is shown once and only its hash is stored, so these emails use a second key that the server can rebuild: `sha256("order-email-link:" + stored hash)` (`emailLinkKey` in `ordering/access-key.ts`, built per message by `OrderLinks`). No new secret, no schema change: the stored hash is known only to the server and the database, and anyone who can read it can already read the order. The order page and the invoice download accept either key, and both comparisons always run, so timing does not reveal which one matched. The link is as long-lived as the checkout key, and it opens only its own order. Used by the payment-confirmed, cancelled and invoice emails; the shipped and delivered emails of Stage 16 take the key from `OrderLinks.keyFor(order)`. Verified locally: the link in a payment-confirmed email opens the order (200) and the invoice PDF; a wrong key, no key, or another order's key answers 404.
- **Inventory sorted by stock reads an index.** Migration `0002_inventory_sort_index.sql` adds a partial index on active variants (`stock, product_id, position, id`). Ascending uses it as it is; the descending sort reverses every column so the same index is read backwards (`EXPLAIN QUERY PLAN` shows a covering index scan with no temporary sort, and the "out of stock" filter becomes a range search). Sorting by name or by value still reads every active variant, because those keys are computed per row; that is fine at template scale. If a store grows to tens of thousands of variants, the default name sort is the one to revisit (a stored, indexed name column).
- **Back-in-stock form.** The subscription endpoint exists; the form on the product page belongs to Stage 7 and is still unbuilt.
- **Stage ticks.** Stages 5 and 6 were ticked while a "Done when" item was still unverified: the retry and dead-letter paths (5) and the 360 px storefront check (6). They are now unticked until those are exercised. Stage 13's filter round trip through the URL was delivered by Stage 14 (filters are GET parameters), so it stays ticked.
- **Files over 250 lines** (rule in CLAUDE.md) were split: the catalog read model (`catalog-*.ts`), the container (`container.ts`, `identity.ts`, `ordering.ts`), the order repository (`order-mapper.ts`, `order-statements.ts`), `place-order-support.ts`, `paypal-support.ts`, the checkout form (`CheckoutAddressFields`, `CheckoutSummary`, `checkout-support`), the email definitions and the widget registry. Left as they are: the two dictionaries (data that grows with every screen), and two files a few lines over (`CheckoutForm.tsx` 258, `inventory-queries.ts` 252).
- **Known limits.** The low-stock "alerted today" marker and the alert day use the UTC day. D1's batch size ceiling is not documented, so the 30-line order cap and the 400-row import cap are conservative guesses to measure on a deployed Worker.

## 2026-10-22 — Stage 7 gaps: suggestions, related products, category language switch

- **Search suggestions.** `GET /api/search/suggest?locale=&q=` returns up to 6 product names and links for a prefix of two letters or more (FTS prefix search, rate limit `api`). The header search button is now the `SearchOverlay` island: a dialog with a search box and the suggestions. Without JavaScript it is a plain form that submits to the shop search. It takes its texts as props, so the dictionaries stay out of the browser bundle.
- **Related products.** `listRelatedProducts` returns active products that share a category with the product, most shared categories first, then featured, then best selling, in the page's language. `RelatedProducts.astro` renders them as a carousel and renders nothing when there are none. **The product page does not use it yet**: that page was being edited for the back-in-stock form; add `<RelatedProducts products={await catalog.listRelatedProducts(locale, product.id, 8)} view={view} />` below the description.
- **Category language switch.** A category page's alternates now come from `getCategoryAlternates`, so `/es/shop/camisetas` links to `/en/shop/apparel`.
- **Checked** on the dev server: suggestions for "cami", nothing for one letter, 422 for an unknown language, the category alternates, and the related-products query on a seed product. **Not checked in a browser**: the dialog itself. (Checked in a browser later the same day, see below.)

## 2026-10-22 — Stages 5 to 8 close-out

- **Stage 5 exercised.** The first attempt asks for a 30 s retry delay and the third for 600 s (`dev/jobs`, dispatch-retry). The dead-letter batch writes `failed_jobs` with `Retries exhausted` and acks. A real enqueue of `inventory.back_in_stock` with an empty payload is consumed by the queue, logged as `job.failed` and recorded in `failed_jobs`. Still open: the dead-letter wiring of a deployed Worker, which only Cloudflare can exercise.
- **Stage 6 exercised.** `/es/ui-kit` at 360 px: all ten sections render, with three charts and four carousel slides, and there is no horizontal scroll. Every tap target is 44 px or more; the small native inputs sit inside labels that are taller.
- **Turnstile in islands.** Widgets are rendered explicitly after the island mounts (`ui/lib/turnstile.ts`). The script's implicit render left the contact form without a widget in the browser. The contact form and the back-in-stock form share that hook; the contact form now gets a token and sends.
- **Live count.** `GET /api/catalog/count` runs the listing's own filter SQL (`countProducts`), so the button's number equals the list it opens. The button asks again 300 ms after a change, and only the newest answer is shown. Without JavaScript the button submits the form as before.
- **Back-in-stock form.** It appears only for tracked, sold-out options, the rule the subscription use case enforces. Checked in a browser: the validation message, a success message, and a fresh widget token after each failure.
- **Void.** `VoidInvoice` checks `invoices.void` before any lookup, so an editor gets 403 whatever the route. Checked: a refunded order's invoice is voided, a repeat void is refused, and the re-rendered PDF contains the VOID text. The layout of that PDF still needs a person to look at it.
- **Cart.** It persists across navigation and reload. After a catalog price change, the quote shows the "price changed" notice and the stored unit price is updated.
- **Stage 10 unchanged.** Open: live card-gateway and PayPal runs (PayPal needs the user's credentials) and a browser pass over checkout. The HTTP checks of this stage pass.
- **Stage 7 closed.** A read-only browser pass (nine checks at 360 px) and HTTP checks agree. The results button shows the count for the chosen filters (39 becomes 35 when "stock" is ticked, equal to the endpoint). Unsorted parameters redirect with 301, and `?category=` moves to its path with 301. Filtered pages are `noindex,follow`; unfiltered pages are not. The count equals the listing in every combination tried: stock, sale, new, stock with sale, price range, an attribute value and category. The language switch opens the same product in English, and no page scrolls sideways. Fixed in this pass: the results button now stays in view while the drawer scrolls, because it had been inside a 112 px containing block. Not built: the range slider for price (the filter uses two number inputs), the active-filter chips, and the variant picker as an island (the variant links work without JavaScript).

## 2026-10-22 — Checkout and invoices after review

- **Checkout Turnstile fixed.** The widget was rendered by Astro's implicit script, which ran before the checkout island mounted. The widget never appeared in the browser, so orders were refused with the bot-check message. Checkout now renders it with the same explicit hook as the contact and back-in-stock forms. Checked in both languages: a token is produced and the submit button is enabled. A second session found the bug in a browser pass.
- **Void is audited.** The owner's void records who voided the invoice. It also writes an order timeline entry (`invoice_voided`, with the reason and the admin's id) in the same batch as the status change. The stored PDF is deleted before the change, so a failed delete leaves the invoice issued and the owner can retry. Checked on FV-000004: the first void returned 200, a repeat returned 409, the invoice shows the reason and a cleared PDF, and one timeline entry exists. That check also set order 1020 to refunded in local test data.
- **One set of invoice options.** `invoiceDocumentOptions` moved to `invoicing/invoice-options.ts`, and the customer page uses it. The stored PDF (`storePdf`) still builds the same options inline and should switch to the helper; that file belongs to another session.
- **Invoice page.** It sends `x-robots-tag: noindex, nofollow`, because the key is in the URL. The document has a viewport tag and a narrow-screen layout, applied on screen only, so the printed PDF keeps its A4 layout. The header's right-aligned block uses a class instead of an inline style.
- **Product page.** The Turnstile script and the inventory setting are read only for a sold-out option, so other product views do no extra work.
- **Results button.** It is `aria-live="polite"`, so screen readers announce a new count.
- **Open.** A Turnstile widget that never loads still ends in the server's bot-check message, not a message of its own. The line chart now has axis labels, a grid and room for its first and last points, which the dashboard uses. Its two range inputs both fill from the left. The order page has a noindex meta from the layout but no noindex header.

## 2026-10-22 — Stage 16 (admin orders, invoices, messages, message log, failed jobs, dashboard)

- **Order moves are checked and recorded.** An owner or editor moves an order through `paid`, `processing`, `shipped`, `delivered`, `cancelled` or `refunded` (the states the store sets by hand; `refunded` only records a refund made outside the store). Each move is one guarded transition with a timeline entry naming the admin. The customer message is queued unless the owner turns it off, and `shipped` takes a tracking code, which the shipped message now shows. Checked on test order 1040 over HTTP: each step queued its message and sent it (payment confirmed, processing, shipped, delivered; the invoice e-mail went out with the paid step), the timeline names the owner, the tracking code is stored, and a move back to `paid` returns 409.
- **Cancellation returns stock.** A cancelled order gives its stock back through the ledger, and the restored lines go to the stock alerts.
- **Failed jobs.** Owners retry or discard a failed job. A retry queues it again and resolves the original as retried; a second retry or discard returns 409. Checked with an `inventory.back_in_stock` job that fails on an empty payload.
- **Failed messages.** A failed message is sent again by queueing the failed jobs that hold it, matched by the message's idempotency key; those jobs are resolved as retried. Checked with a matching failed job: the retry returns 200, a second one 409, an unknown message 404.
- **Invoices.** The list filters by status, series, a store-local day range, and invoice number, order number or buyer; the totals count issued invoices only. The detail shows the store's own document in a frame, a resend action, and for owners the void form. Checked: filters (including an impossible date, which is ignored), detail, document, and 404 for an unknown invoice.
- **One helper for each message.** The invoice e-mail is `queueInvoiceEmail`, used by the first send, the render job and the resend. The customer order message is `notifyOrderCustomer`, used by the payment webhook, the manual moves and the cancellations.
- **Reads.** Each paged list finds its page's ids first and loads only those rows; counts and totals run in the same batch as the ids.
- **Fixed on the way.** The contact-message and notification-log lists sort by a unique tiebreak; the failed-job resolve is guarded, so a job cannot be resolved twice; batch results are read by position with guards, because `noUncheckedIndexedAccess` rejects destructuring them.
- **Notices for retired methods.** The customer notice for an order stored with the retired card method was never queued: the payment-method name lookup threw. Order 1003 had no processing notice because of it. The order sections now fall back to the stored value, as the admin pages do.
- **Order screens.** The order list filters by status, payment method, a store-local day range and search. The order detail shows the customer, the shipping method and address, the tracking code, the items, the totals, the payment, the status form, the invoice panel, the timeline and the messages sent for the order. Checked over HTTP with the owner session: each page returns its status, a missing order is 404, and a visitor without a session is sent to the login page. The timeline shows labels, not stored codes. The storefront history had the same gap (a manual status change showed as `status_shipped`); both now read one label function (`orderEventLabel`) and one list in the domain (`ORDER_EVENT_TYPES`). A new event type needs its label in `order.events`; a status change takes the name of its status.
- **Invoice action and export.** An owner or editor can issue the invoice of a paid order that has none, from the order page, when the store's invoicing is on. The action is idempotent: an order that already has its invoice gets that invoice back. The invoice list exports to CSV with the filters the screen uses, up to 5,000 rows; the screen says so when a filter matches more. Checked: the export answers 200 with the header row and the screen's filters; the action answers 404 for a missing or malformed order number, and on order 1040, which already has its invoice, it answers 200 with the existing invoice.
- **Invoice PDF, customer link and origin.** The owner can queue a fresh PDF of an invoice. The render job replaces the stored file and does not send the customer a second email, because the invoice e-mail has the same notification key as before. The order screen copies the customer's order link, built with the key the emails use, and downloads the invoice PDF through the customer's PDF address. It shows the origin the checkout captured: the campaign and referral values. Checked: regenerating an unknown invoice answers 404, and order 1040 offers the copy action and the download address.
- **Lists.** The order and invoice lists use the shared filter bar, like the other admin lists. The order list has "new since your last visit": two cookies keep the last two visits to the list, and the view lists the orders created after the visit before the current one. Checked: the view answers 200.
- **Stored payment methods without a label.** Orders stored before the dLocal Go switch keep their method, because the CHECK constraint still allows it, and that method is no longer in the payment-method list, so it has no label. The admin order list and detail show the stored value in its place, and the customer's order page leaves the payment line out. Decided: keep the fallback, with no label and no migration; 18 local test orders are affected. Checked: order 1003 shows its stored value, and the filter accepts the new method.
- **Phone pass.** The admin screens were checked at 360 px with the owner signed in to the browser: no horizontal scroll, and two touch targets were fixed (the invoice links and the failed-job disclosure now have 44 px targets). Order 1002 went from pending to delivered with each notice, and a failed job was retried from `/admin/jobs`.
- **Billing.** Checkout asks for the company name and tax ID when invoicing asks for them (`askBuyerTaxId`), in its own section before payment. Both are stored on the order (`billing_json`), copied to the invoice buyer, and shown on the order page. The invoice document prints the company name in place of the contact name, with the tax ID under it. Checked over HTTP: an order with the details stores them, an order without them stores `{}` and has no billing panel, the issued invoice's buyer and document carry them, and the checkout offers the fields in both languages.
- **Still open.** Not built yet: retrying legal issuing (the legal issuer is still a no-op) and a refund screen (refunds are recorded by hand). The failed-jobs page shows the queue backlog where the platform reports it; the local runtime does not, so there it says so. Requests to the local dev server sometimes come back as a 500 "fetch failed" from the dev runtime, before any app code runs; the stack shows only the dev dispatch, and curl sees it too, now and then. The cause is not known, so check these pages in a browser. The message log and the order messages show each notification key's label, with the key under it.

## 2026-10-22 — Independent checks for stages 5, 6 and 10

Run by a second session with its own scripts (outside the repo), on the local dev server.

- **Stage 5, all five delays and the dead-letter batch.** A handler failing with a temporary error asks for retry delays of 30, 120, 600, 1,800 and 7,200 seconds on deliveries 1 to 5 and stays at 7,200 after that. A dead-letter batch is recorded in `failed_jobs` as "Retries exhausted" with its attempt count and acknowledged. A job with an invalid payload sent through the real queue lands in `failed_jobs` on its first delivery.
- **Stage 10, checks that need no browser (15 of 15).** Two simultaneous carts for the last unit give one order and one 409, and stock never goes negative. A pending order whose hold expired is cancelled by the scheduler: the ledger reads `initial`, `sale`, `cancel_restore`, the stock is back, the cancellation email is sent, and the unit can be bought again. The order and store notifications are queued and sent by the consumer. PayPal sandbox still needs the user's credentials, so the stage stays open.
- **Stage 6 at 360 px, 18 storefront pages in both languages** (headless Chrome, mobile and touch emulation): none scrolls sideways, and every tap target is at least 44 px except the breadcrumb "Shop" link on the English product page (32 px wide). Not covered: screenshots, and the carousel under reduced motion.

## 2026-10-22 — Stage 11 closed, Stage 10 down to two live-provider checks

Run against the local dev server with scripts outside the repo.

- **Stage 11, every "Done when" criterion verified.**
  - Paying issues the next FV number automatically, with a stored PDF that downloads with the order key (or the email key).
  - Two orders paid by two signed events sent at the same instant got consecutive numbers (FV-000015 and FV-000016), each with a stored PDF.
  - The invoice email carries the PDF: with the console sender now listing attachments, the emails for FV-000017 and FV-000018 show `FV-000017.pdf (45024 bytes)` and `FV-000018.pdf (45314 bytes)`.
  - The generated PDFs were rendered in Chrome: an A4 page with seller and customer side by side, the line items, the tax table and the totals. The voided invoice (FV-000003) carries the ANULADA mark across the page. This closes the open item from the Stage 11 entry above.
  - The customer invoice page is correct at 360 px, and the void records who did it.
- **Stage 10, verified locally:** oversell (two simultaneous carts, one 409), expired orders returning stock (ledger `sale` then `cancel_restore`), notifications queued and sent, WhatsApp (the checkout form opens a `wa.me` tab whose message carries the order number, and the order page has the same button), and the bank transfer and cash on delivery orders show their instructions. A signed completion event of the first card gateway marks the order paid and a full refund marks it refunded. PayPal sandbox: the credentials work and checkout creates a real sandbox order whose total equals the store's.
- **Stage 10, still open (needs the user's accounts):** (1) a test-card payment with the first card gateway: there was no secret key in `.dev.vars` (the webhook secret there was a local value) and no gateway CLI on this machine; (2) a PayPal sandbox payment: the buyer must approve the order on PayPal before it can be captured, which needs a sandbox buyer login. `PAYPAL_WEBHOOK_ID` is also not set, so PayPal webhook signature verification is untested. The PayPal order carries only a total (no item breakdown) and uses `application_context`, which PayPal now treats as deprecated; the plan named `experience_context`.
- **Console email sender** now lists attachments by name and size, so a developer can confirm an email carries its PDF.

## 2026-10-22 — Review follow-ups: rate limits, settings, session, facets, reading cost

From the architecture review. Measured where it says so.

- **`defineEndpoint({ rateLimit })`.** The plan's endpoint factory had a rate-limit option that was never built, so eight places hand-wrote the same four lines. The option takes a bucket (`'api'`, `'forms'`, `'auth'`) or `{ bucket, scope }` for an endpoint with its own counter (first-owner setup), and runs before the body is read. Converted: checkout, contact, stock subscriptions, the live count, search suggestions and first-owner setup. The cart quote had no limit and now uses `'api'`, as the plan said. Sign-in and password reset keep their own keys inside their use cases. Checked: 90 simultaneous suggest requests gave 59 answers and 31 with 429 (the bucket is 60 per 10 s), and a request after a pause worked again.
- **Settings.** The repository reads the whole table in one query per request instead of one per group (a storefront page asks for seven or more) and, in production only, lets requests share the rows for 30 s (`sharedTtlMs`). A save drops the cache at once in its own isolate; other isolates see it within 30 s. In development nothing is shared, so edits to the local database show on the next request (checked).
- **Admin session** is resolved only for admin pages and endpoints; a signed-in admin browsing the shop costs no query.
- **Facets** send their independent reads together with `db.batch` (two round trips). Per-attribute counts stay separate statements because each ignores its own selection.
- **Reading cost of this repository.** `CLAUDE.md` used to require reading the whole plan before every task, about 26,000 tokens, plus `DECISIONS.md` (about 14,000 and growing). It now asks for `PROGRESS.md`, one stage section and `ARCHITECTURE.md`, about 3,700 tokens in total, and treats `DECISIONS.md` as grep-only.
- **Not done from the review:** keeping zod out of the admin product editor bundle (28 KB gzipped, admin only), a logger port for `http/errors.ts`, one shared hook for the cart quote fetch, moving the back-in-stock rule from the product page into the read model, a keyed HMAC for the email order link, security headers (Stage 23) and the storefront page cache (Stage 21).

## 2026-10-22 — Card gateway replaced by dLocal Go

The user chose dLocal Go as the card gateway. Everywhere the plan names the previous card gateway, read dLocal Go; the method id is `dlocalgo`.

- **Flow.** `DLocalGoGateway.initiate` creates a payment (`POST /v1/payments`) and the buyer is redirected to the hosted checkout. The amount goes out through `majorTextOf` and every amount coming back is read through `providerAmountMinor`, so PayPal and dLocal Go share the money rules (no floats in the domain).
- **Webhook = verify, then ask.** The notification is signed (HMAC-SHA256, key = secret key, message = API key + raw body). After the signature check the adapter reads the payment (or the refund) from the API and builds the confirmation from that answer, never from the notification body. `ConfirmPayment` stays idempotent through `PaymentEventLog`, with event id `<payment id>:<status>`.
- **Success page settles.** Returning from the hosted checkout, a pending `dlocalgo` order calls `CapturePayment`, which re-reads the payment; the order does not wait for the notification. A failure there is logged and the notification settles it later.
- **`REJECTED` is not final.** dLocal Go lets the buyer retry on the same payment, so only `PAID`, `CANCELLED` and `EXPIRED` change the order. A refund counts only when it is `SUCCESS` and for the full amount.
- **Migration 0003** rebuilds `orders` because the method CHECK changed. The three child tables (`order_items`, `order_events`, `invoices`) are copied, dropped and recreated around it, since D1 keeps foreign keys on and dropping the parent otherwise fails at COMMIT. Tested on an in-memory copy and on the local database; rows and counts are preserved. It also renames the retired method to `dlocalgo` in the saved checkout settings.
- **Configuration.** `DLOCALGO_API_KEY` and `DLOCALGO_SECRET_KEY` are secrets; `DLOCALGO_ENV` is `sandbox` or `live` (sandbox by default). The "smart fields" key dLocal also issues is for an embedded card form; the hosted checkout does not use it, so it is not read.
- **Verified in the sandbox (2026-10-22).** The store creates the payment with the right amount, currency and links; a notification with a wrong, missing or tampered signature is refused; a signed one for an unpaid payment changes nothing; a card payment with the 4111 test card in the hosted checkout returns to the order page, the order is `paid`, one invoice exists, and a repeated signed notification changes nothing (status, events, invoices and stock are the same).
- **PayPal sandbox (2026-10-22).** A buyer logged in to the sandbox and approved order 1057 (USD 80.00); the return page captured it, the order is `paid` with events `placed` and `payment_confirmed`, invoice 23 was issued, and stock fell by the two units once. Stage 10 is ticked on this and the dLocal Go run above.
- **Not covered, and why.** A second PayPal capture could not be replayed (PayPal shows its "already completed" page and the order key is stored hashed); the idempotency of a repeated confirmation is the shared `ConfirmPayment` path checked with dLocal Go. `PAYPAL_WEBHOOK_ID` stays unset until the store has a public URL to register. Live use needs each client's production keys for both providers and the dLocal Go notification URL registered in their account.

## 2026-10-22 — Stage 17 in progress: settings and page builder

- **Settings forms.** Every settings group has a form definition (`settings-fields-store.ts`, `settings-fields-business.ts`). Each key is typed against the group's zod schema, so a key added to the schema without a form entry does not compile. The zod schema stays the one validation; the form posts the whole group to `/api/admin/settings/<group>`, owners only (`settings.manage`).
- **Labels live with the definitions.** Field labels are bilingual, as the widget and email definitions already are, so a definition is read in the admin's language without a lookup. Admin chrome (buttons, messages, group names) stays in the dictionaries. This is a deliberate deviation from "strings in UI come from i18n", for field labels only.
- **Two field kinds added.** `object` stores a group of fields as one object (the social links). `nullable` on select and number fields sends an empty choice as null. `fieldsToSchema` handles both.
- **Image settings** are a select of the media library (the first 100 assets). No picker yet.
- **Page builder.** A system page with no saved row is edited from its code default; its row is created by the first save, with the slug as its id, because the slug column is unique. Each section is checked against its widget before anything is written, so a refused save writes no row. System pages cannot be deleted, even before they have a row. Custom pages start unpublished and empty.
- **Still open:** the email editor, shipping methods, testimonials, users, and a browser check of the builder and the settings at 360 px.

## 2026-10-22 — Stage 22 (SEO and i18n polish)

- **Head tags.** `SeoHead.astro` renders robots, canonical, hreflang, Open Graph, Twitter and JSON-LD for every page. hreflang URLs are now absolute (pages still pass paths) and an `x-default` points to the store default language (`general.defaultLocale`, passed by the pages that are indexable). Noindex pages omit `x-default`.
- **Structured data.** Home: `Organization`, `WebSite` with a `SearchAction` (`/shop?q=`) and, when the store has an address, a `Store` node. Product: `Product` with an `Offer` (one price) or `AggregateOffer` (a range over active options), `availability` and a `BreadcrumbList`. Category: `BreadcrumbList`. Prices are built from minor units without floats. No `aggregateRating`: Google reviews are not the store's own rating. The product DTO carries no currency, so the page passes the store currency.
- **Sitemap and robots.** `/sitemap.xml` lists the home, shop and contact pages, active categories and products, and published content pages (system pages still on their code default included), one URL per language with every alternate and `x-default`. Drafts, archived products and filtered shop URLs never appear. At most 20,000 products (one file holds 50,000 URLs, two per product). `/robots.txt` closes `/admin`, `/api/`, cart, checkout and orders and names the sitemap; filtered shop URLs stay crawlable on purpose so crawlers can read their `noindex`. Both are cached for an hour.
- **Error pages.** `404.astro` and `500.astro` use a bare document (no settings read, so they render when D1 is down), follow the URL's language (`Astro.originPathname`, because a rewrite replaces the request URL) and are noindex. Storefront pages now `Astro.rewrite('/404')` instead of answering plain text.
- **Not done.** The site-wide sharing image (`seo.ogImageMediaId`) is not resolved to a URL yet: nothing maps a media id to a key outside the admin, so product pages use their first picture and other pages have no `og:image`. The Rich Results test needs a public URL; the markup was checked for shape and prices against the database.
- **Dictionary audit.** 825 keys in each language, none missing, none empty, no placeholder mismatch (`es.ts` is typed against `en.ts`). Eight storefront strings are identical in both languages on purpose (Subtotal, Total, PayPal, Legal and the UI-kit labels).
- **Checked** with a script against the dev server: sitemap well-formed with the exact set of active products, hreflang and Open Graph on the home page, product JSON-LD price equal to the database, filtered URL `noindex`, localized 404 in both languages.

## 2026-10-22 — Stage 23 (security hardening and observability)

- **Headers.** `withSecurityHeaders` (`src/http/security-headers.ts`) wraps the whole middleware, so pages, API routes, redirects and 404s all get HSTS (https only), nosniff, the referrer and permissions policies, `frame-ancestors` plus `X-Frame-Options`. Static files bypass the Worker, so `public/_headers` repeats the set (the build merges it with the immutable-cache rule for `/_astro/*`). Camera stays allowed for the admin scanner.
- **No `script-src` yet.** It needs Turnstile, Cloudflare Web Analytics and Astro's inline scripts allowed through nonces or hashes; a wrong policy breaks checkout. Decide it with a report-only run on a deployed store. Until then a scanner may grade the CSP as partial.
- **Body limits on received bytes.** `readBody` now counts the stream and cancels it past the limit; before, only `Content-Length` was checked, which a chunked request omits. Same signatures and limits (JSON 64 KB, forms 11 MB).
- **Auth endpoints** got `rateLimit` scopes (`login`, `forgot`, `reset`) so a flood is refused before parsing and before the use case reads the database. The use cases keep their per-email limits and the Turnstile check.
- **Validation errors** answer `details: { issues: [{ path: 'a.b', message }] }`, the shape the use cases already used, so one form handler reads both (asked for by the admin forms).
- **Logs.** `request.refused` for sign-in, permission, rate-limit, bot-check and provider refusals; `webhook.accepted`/`webhook.rejected` per provider; the two payment return pages log through `src/http/log.ts` instead of `console.warn`. The planned `http/log.ts` re-exports the existing logger, so pages never import an adapter.
- **Checked.** Every public mutation has a rate limit and, where it creates something or sends email, a Turnstile check; every `/api/admin` route is behind the middleware; webhooks verify signatures on the raw body; order links compare keys in constant time; CSV cells are guarded; the `set:html` uses take sanitized Markdown, validated theme CSS and escaped JSON-LD. A cross-origin form post answers 403; a chunked 70 KB JSON body is refused. `docs/SECURITY.md` holds the threat table and the endpoint checklist.
- **Open.** The scanner grade (needs a public https URL). Admin two-factor sign-in and a WAF rule set are not in the plan.

## 2026-10-22 — Stage 17 and the first Stage 18 to 25 pieces, in progress

- **Content admin.** Testimonials, shipping methods, users and email templates have their admin screens and use cases. Testimonial and shipping writes need the permission that the role map gives them: testimonials need `content.edit` (editors too); shipping prices need `settings.manage` (owners only). The email editor lets editors save copy; only turning off a store or admin email needs `emails.disable_store_alerts`.
- **Email blocks.** The editor inserts `{{block:name}}`, the syntax the template engine reads.
- **Users.** The last owner cannot be demoted, deactivated or removed, and nobody changes their own account. The last-owner check is count then write, so two concurrent demotions could both pass; a transaction fixes it when needed.
- **Translation (Stage 24).** The translator is Workers AI `@cf/meta/m2m100-1.2b` (languages en and es). Placeholders are masked before translating and restored after; a result that loses a placeholder is returned as not kept, and the editor then does not apply it. Nothing is saved automatically.
- **Dictionaries.** Admin keys for these areas were merged from the subagents' JSON files into both languages.
- **Post-commit failures.** An order or invoice that is already committed no longer fails the request when a notification or a job enqueue fails: the failure is logged and the committed result is returned. A slug race now returns CONFLICT.
- **Known follow-ups** (from the read-only review): display messages returned as text instead of codes (save-page, page-schemas, settings-schemas, fields-to-schema, place-order); invoice labels hardcoded in invoice-document.ts; currency and payment-method enums duplicated in settings-schemas; settings maxima kept only in the form definitions; paypalExchangeRate uses a float; some JSDoc gaps; three files over 250 lines (PageBuilder.tsx, CheckoutForm.tsx, SchemaControl.tsx).
- **Still open for Stage 17:** the storefront testimonials widget, the consent banner mount (waiting for the storefront layout work), and the browser check at 360 px.

## 2026-10-22 — Stages 19 and 25 pieces, and local build notes

- **Deployment (Stage 25).** `scripts/deploy-client.mjs` and `scripts/deploy-all.mjs` run the steps in order (write config, build, queues if missing, remote migrations, deploy) and have `--dry-run`. Nothing is deployed until the demo and a second client have their `.secrets/<slug>.env` account files. The runbook lists dLocal Go and PayPal, the gateways the code supports. The `@client` alias exists but no source file imports it yet, so client extensions do nothing. `client:new --account-id` supports clients with their own Cloudflare account. The capacity figures are copied from the plan and have not been checked against current Cloudflare limits.
- **Product feed (Stage 19).** `/feeds/products.xml?locale=es|en` builds RSS 2.0 with the g: namespace from the catalog feed read. Variants without an image are skipped, because Meta rejects them. `g:color` and `g:size` are empty until the feed reads the attribute codes from settings, which needs catalog query changes. `additional_image_link` is not produced, because the feed item carries one image.
- **Analytics Engine writer (Stage 19).** `AnalyticsEngineSink` is written and tested with fake data, but not wired into a container or middleware. Its data point layout is in `docs/ANALYTICS.md`.
- **Consent (Stage 19).** The consent cookie, the banner and the "Privacy settings" link are written and tested as pure functions, but the banner is not mounted in a layout yet. Mounting belongs to the storefront layout work, after the SEO and security sessions.
- **Local build.** While the dev server runs on Windows, `npm run build` can fail with EPERM on `dist/client`, because the dev server holds that folder. The code compiles: `npx astro build --outDir <scratch folder>` completes. Stop the dev server before a final `npm run build`.

## 2026-10-22 — Stage 21 (caching and performance)

- **Page cache** (`src/http/page-cache.ts`, called from the middleware). GET requests of storefront pages (`/es`, `/en`, except cart, checkout and orders), `/sitemap.xml` and `/robots.txt`, with no `key` parameter, are answered from `caches.default`; a MISS renders and stores the page in `waitUntil`. Only 200 responses without `Set-Cookie`, `private`, `no-store` or `no-cache` and of type HTML, XML or text are stored, for 300 s. Every response carries `x-page-cache: HIT|MISS|BYPASS`; the security headers are added after the cache, so a HIT has them too. It is off in `astro dev` (edits to the local database must show at once), on `*.workers.dev` (no edge cache there) and when the `PAGE_CACHE` var is `off`.
- **Key = build id + version + path + query.** The version comes from KV and every admin save bumps it (`invalidatesCache`), so the next visit is a MISS. The build id (`__BUILD_ID__`, set in `astro.config.mjs`) is new: without it a deploy leaves cached pages that point at asset files the new deploy no longer has, and the first rebuild during testing served exactly that. KV reads the version with a 60 s edge cache, so another location can serve an old page for up to a minute after a save.
- **The bump never fails a request.** `bumpPageCache` catches and logs `page_cache.bump_failed`; the save has already committed (CLAUDE.md: nothing after a commit may fail the request). The inventory import route uses it too.
- **Analytics order.** Analytics does not exist yet (Stage 19). When it does, it must run before the cache so a HIT still counts a page view.
- **Images.** Product cards now carry their sizes (`imageVariants`, up to 960 px) and render `srcset` and `sizes` for the shop grid; the first two cards of a page (and of the first home section, through `first` on widgets) load at once with `fetchpriority="high"`. The product page's main image still has no `srcset` because the product DTO only holds the key.
- **Font.** The Latin file of the theme's font preset is preloaded. Without it the web font swapped in late and the shop page shifted by 0.068 (budget 0.05); with it the shift is 0.
- **Measured** with headless Chrome against the production build (390 px wide, 4x CPU slowdown, 1.6 Mbit/s, 150 ms): JavaScript 14.1 KB gzip on home and 14.7 KB on shop and product (budgets 30 and 45 KB), LCP 1.2 s (home), 1.2 s (shop), CLS 0 on all three. Cache check script: HIT after MISS for home, product, a query string and the sitemap; never for cart, checkout, orders, order links with a key, API, admin or 404; an admin status save makes the home page a MISS again.
- **Lighthouse** (mobile, run with the user's approval through `npx lighthouse` against the production build). First run: performance 96, 98 and 99 (home, shop, product), best practices 100, SEO 100 / 100 / 92, accessibility 92 / 91 / 96, CLS 0. The findings and their fixes: product-card image links had no accessible name (now `aria-hidden` and out of the tab order, the name link below stays), placeholder and count text at 50% opacity and the white-on-green WhatsApp buttons were under 4.5:1 (now 70% and `emerald-700`), the language link's label did not contain its visible text (now "EN Language"), card names skipped a heading level on the shop (now `h2` there), and a product with no description had no meta description (`metaDescription` falls back to the short description, an excerpt, the store default, then the store name). Second run: home and product accessibility 100 and SEO 100; shop 96 with one contrast item left, the disabled "Previous" link in the pagination, fixed afterwards (`text-text/60`) but not measured again because the preview server would not restart in that session.
- **Seen on a custom domain (2026-10-22, https://ecommerce.relion-app.com).** Repeat visits of `/en/`, `/es/` and `/en/shop` answer `x-page-cache: HIT` with `CF-Cache-Status: HIT`; `/en/cart` is never cached; `/sitemap.xml` and `/robots.txt` start as MISS. The response also carried `max-age=14400`: the zone's Browser Cache TTL adds one when a page sets none, which would let a returning visitor's browser keep a page for four hours after an edit. The stored and the returned copies now send `public, max-age=0, s-maxage=300` (checked locally on MISS and HIT; needs a deploy to take effect there). Cloudflare also sends its own HSTS (`max-age=15552000`) in place of ours on that zone.
- **Not measured.** The shop page after the pagination fix, and an admin save followed by a MISS on the deployed store (that needs an admin login there; checked locally).

## 2026-10-22 — Stage 19 wiring, consent decisions and the storefront outage

- **Purchase events need consent.** Checkout does not record marketing consent yet, so every order has marketingConsent false. ReportPurchase sends nothing to Meta for those orders, not even a request without personal data, because the stage rule says no Meta request without consent. Checkout must record the consent from the cookie on the order before any purchase is sent.
- **view_item has one source.** The browser beacon sends view_item with the pixel event id, so Meta and the analytics dataset agree. The server writes page_view only.
- **Banner state is client-side.** The page cache keys on path only, so the server renders the banner from settings alone; the browser reads the consent cookie and hides or shows the banner. A consented visitor may see it briefly before hydration.
- **Storefront outage.** The analytics step called app.platform.analytics, which the container did not define, so every storefront HTML page returned 500. The step now records through the container's analytics writer and cannot fail a page.
- **Known gaps:** the Analytics Engine purchase write, real Meta calls (the tokens are not set), and the storefront browser check of the Accept flow.

## 2026-10-22 — Consent at checkout, WhatsApp call sites, cart islands

- **Consent is recorded at checkout.** The checkout endpoint reads the buyer's own consent cookie; the request body cannot claim consent. The order stores the flag (marketing_consent). Purchase events go to Meta only for orders with the flag set, so the earlier gap is closed for buyers who consent.
- **WhatsApp notices carry the phone and the opt-in.** Order received, cancelled, invoice, and back-in-stock notices pass both. The low-stock store alert is sent when any alert channel is chosen, so a WhatsApp-only setting still queues the message; the e-mail is sent only when e-mail is chosen.
- **Cart islands render on the client only.** The server cannot know the saved cart, so the badge and drawer were rendering an empty cart and then hydrating a different one. Both are client-only now; the cart badge is no longer server rendered.
- **Reports check.** The 30-day revenue on the sales page matches an independent SQL sum (22 orders, 53,700 minor). The CSV is text/csv with a header row.

## 2026-10-22 — User guide with Starlight, screenshots by script

- **Starlight in `docs-site/`.** The guide for store owners (admin) and for clients buying the template is an Astro Starlight site in its own folder, with its own `package.json` and lockfile (`@astrojs/starlight`, `astro`, dev-time only). It is not part of the store's Worker or dependency list, and the root `eslint`, `prettier` and `tsconfig` skip it. Starlight was chosen over VitePress because the store already uses Astro; it brings i18n, search (Pagefind) and image optimization. Content is Markdown, so it can move to another tool without rewriting.
- **Screenshots come from the product.** `scripts/docs/` starts a demo store from the production build on port 4400 with its own database in `.wrangler/docs-state` (`npm run docs:store`), fills it with sample products, generated pictures, orders in every state, messages and testimonials (`docs:data`), and takes the screens with the installed Chrome over the DevTools protocol (`docs:screens`), with no extra npm package. The scripts refuse any address that is not on this machine. The demo owner's login is generated and kept in `.wrangler/docs-admin.json` (ignored).
- **Language.** Spanish is the main language of the guide (served at the root, as the store's clients and owners are Spanish-speaking); English is under `/en/`. Each language has its own screenshots (`docs-site/src/assets/screens/es` and `en`), taken with the matching interface language (`DOCS_LANG`), because the button names in the text must match the screen. The Spanish text uses the labels from `src/ui/i18n/dictionaries/es.ts`.
- **Checked.** The guide builds (49 pages, search index, no broken internal link).

## 2026-10-22 — Root redirect ignores the browser language

- **The store default decides the language of `/`.** The root redirect used to follow the visitor's `Accept-Language` header before the store default, so an English browser landed on `/en/` even though the store is set to Spanish. Now only the `locale` cookie (the visitor's own choice from the language switcher) overrides `general.defaultLocale`. The plan's order (cookie, then `Accept-Language`, then default) is superseded here. Error pages use the same order.
- **Trade-off.** English-speaking visitors now see Spanish until they pick English. The language switcher still works and is remembered in the cookie.

## 2026-10-22 — Storefront redesign with pictures, and example content

- **Why.** A new store looked empty and unfinished: the hero had no picture support (the field existed, the renderer ignored it), category tiles were grey boxes, the promo banner, gallery and FAQ sections could be added in the page builder but rendered nothing, the footer links were misaligned, and the returns badge had no icon (the stored value is `return`, the icon file is `returns`).
- **Pictures in sections.** `loadSectionData` now reads the pictures the enabled sections use in one query (`MediaLibrary.getMany`) and hands them to the widgets as `SectionData.media`; `SectionPicture` serves them with `srcset` and fixed width and height. Category tiles use the category picture (`listCategories` joins the media row). Section links such as `/shop` get the page language added (`localizedHref`), because one link serves both languages.
- **New and redesigned sections.** Hero with a full-width picture, gradient and button (one slide at a time on every screen: `Carousel` gained `single`); category tiles with photos; promo banner; image gallery; FAQ (`details`, no script); benefit row with icon discs; product cards keep rows aligned; footer in three columns with headings; a "view all" link on featured products.
- **Slow first paint fixed.** Sections fade in as they scroll into view, and until a script ran they were invisible. On the home page the benefit row was the largest paint, 4.4 s on a throttled phone (Lighthouse performance 78). The first two sections are now exempt (`data-no-reveal`): performance 100, LCP 1.5 s.
- **Example content.** `scripts/docs/pictures.mjs` draws product shots, category tiles and hero banners in Chrome from colours and emoji (nothing downloaded, so no licence to track) and `home-content.mjs` sets up a full home page through the admin API. They fill the demo store used for the guide; a real store replaces them with its own photos in the admin. The public demo store has an empty catalog, so it still needs products and pictures added in its admin (or the same scripts pointed at it, which they refuse by design).

## 2026-10-22 — Theme settings now take effect; "Editorial" typeface and demo look

- **Bug fixed: a store's theme never applied in a production build.** `themeToCss` emitted `:root{...}` in an inline `<style>`, but the bundled stylesheet is linked after it and carries the defaults in `:root{...}` too. At equal specificity the later rule wins, so every store showed the defaults (black, white, Inter) whatever the admin saved. The block is now `:root:root{...}`, which outranks the defaults regardless of order.
- **"Editorial" typeface preset.** Playfair Display for `h1` and `h2`, Manrope for everything else. Both fonts were already installed, so there is no new dependency. A new `--brand-font-display` variable carries the heading face; for the other presets it equals the body face, so nothing changes for them. Smaller headings (product names) keep the body face because a thin serif is hard to read at that size.
- **Demo look.** `applyDemoTheme` in `scripts/docs/home-content.mjs` saves a warm palette (paper background, oxblood buttons, terracotta accent, square-ish corners) through the theme settings API, and the demo hero banners use earthy colours to match. A new template still starts neutral.

## 2026-10-23 — Audit fixes

- **Search-engine text of pages now reaches the storefront.** The page editor saves a title and description for search engines in both languages, but `loadPageContent` returned only the title, so the home page, custom pages and the contact page ignored what the owner wrote. `PageContent` now carries `seoTitle` and `seoDescription` for the page language, with no fallback to the other language (a Spanish description on an English page is worse than the store default). The empty case falls back through `metaDescription` as products do. The contact page had no description at all.
- **The home page has one `h1`.** The sections use `h2`, so the page had no `h1`. A screen-reader-only `h1` with the store name is added (the visible headline stays a hero `h2`, because a hero is optional).
- **Footer text contrast.** `text-text/60` on the warm surface colour measured 3.93:1; it is now `text-text/75`. Any store with a tinted surface colour would have failed the same check.
- **The unused card-gateway package removed from dependencies** (nothing imported it since the move to dLocal Go); `worker-configuration.d.ts` regenerated, which also dropped its variable names. `ARCHITECTURE.md` lists dLocal Go in its place.
- **Accepted: dev-only audit findings.** `npm audit` reports a high-severity regex denial of service in `braces`, reached only through `eslint-plugin-astro` (a development tool, never in the Worker). The suggested fix is a breaking downgrade of that plugin, so it waits for an upstream release. `npm audit --omit=dev` reports 0.

## 2026-10-23 — User guide hosted at docs.relion-app.com

- **Cloudflare Workers static assets.** `docs-site/wrangler.jsonc` serves `docs-site/dist` as the Worker `ecommerce-guide` on the custom domain `docs.relion-app.com`, public. It is separate from the store's generated Worker config. `npm run deploy` in `docs-site/` builds and deploys.
- **`--config ./wrangler.jsonc` is required.** The root `.wrangler/deploy/config.json` (generated by the store build) makes Wrangler refuse to pick a config from `docs-site/` without it; the deploy script passes it.
- **`wrangler` added to `docs-site/` devDependencies** (the root already uses it) so the guide deploys without depending on the root install. `site` is set in `astro.config.mjs` so the sitemap and canonical links use the real address.

## 2026-10-23 — Testing kit and guide

- **Why.** The template is not tied to a live site, so "tested" is split in levels (TESTING.md): static checks, a local smoke test, local
  webhook simulation, provider sandboxes, and a per-client pre-launch list. Levels 3 and 4 depend on a client's accounts and are done
  per client; a template release never waits for them.
- **`scripts/test/smoke.mjs`** (`npm run test:smoke`) is the stage smoke check made repeatable: pages in both languages, every admin page, the
  public API, refusals, five checkout paths, the invoice PDF, the sales report against a direct database count, and the product feed's fields. It
  talks only to the local demo store (the `docs/shared.mjs` guard).
- **`scripts/test/webhooks.mjs`** (`npm run test:webhooks`) sends correctly and wrongly signed dLocal Go and WhatsApp calls. The demo store now
  starts with fixed, made-up WhatsApp webhook secrets (`DEMO_WEBHOOK_VARS`), so it needs no Meta account and `.dev.vars` stays untouched. PayPal
  cannot be simulated: the store verifies events with PayPal's own API, which refuses mock events.
- **Fix: the phone hashed for Meta now carries the country code.** The Conversions API path hashed the digits as typed, so `300 555 0101`
  was sent without its country code and `0057...` kept its `00`. It now uses the shared `normalizePhone` of `domain/shared/phone.ts`
  with the store's default country code, and the duplicate helper in `domain/analytics` is gone. Email and phone hashes reproduce the
  examples in Meta's Conversions API docs.
- **Observed, not assumed.** Both local cron URLs work with this Wrangler (`/cdn-cgi/handler/scheduled` and the documented
  `/cdn-cgi/local/scheduled`); the page cache gives `HIT` under `wrangler dev`; the rate limits are enforced locally; admin refunds are
  recorded by hand (no provider refund API call), and PayPal refund events are not handled.
- **Open question, left for the first Google upload.** The feed writes `in stock` (Meta's spelling); Google's specification lists `in_stock`.
  Neither is confirmed from an official page for the other service, so TESTING_INTEGRATIONS.md says to read Merchant Center's diagnostics.
- **Audit warning.** Pinning `eslint-plugin-astro` 1.5.0 as `npm audit` suggests lowered the findings from 5 to 4 and cleared nothing; no
  patched `braces` exists on npm yet. Reverted; recheck each release.

## 2026-10-23 — New default look: "Volt", Mono Red, announcement strip, tinted cards, dark footer

- **Picked from the style board** (Volt type, Mono Red palette, Soft buttons, Announcement header, Rounded tint cards, Dark inverted footer). Soft buttons were already the existing button style, so only the others changed.
- **New dependencies:** `@fontsource-variable/sora` (headings) and `@fontsource-variable/outfit` (body), for the new `volt` font preset. It is the default for a new store; stores that saved another preset keep it.
- **Defaults follow the palette:** accent `#e03b2e`, surface `#f4f4f2`; primary, text and background were already `#111111` / `#ffffff`. `applyDemoTheme` now saves the same values (the demo no longer uses the warm Editorial look; its hero banners still use earthy colours).
- **Announcement strip:** new `general.announcement` setting (two languages, 120 characters). Empty hides the strip, so a new template starts without it. `StoreLayout` reads the `general` group (already loaded for the page) and passes the text to `Header`; the strip scrolls away and only the bar is sticky.
- **Product card:** the picture sits on `--brand-accent-soft` (20% accent over the page background) with `mix-blend-multiply`, so white-background product shots take the tint. Price moved onto the picture as a tag; badges moved onto the picture; the category name sits under the centred product name. The card shape is fixed (not tied to the corner radius setting).
- **Footer:** dark surface using `bg-text text-background`. The privacy-settings control (a Preact island) now inherits the footer's colour instead of forcing `text-text`. Column headings stay neutral (not accent) so any accent colour keeps its contrast on the dark surface.

## 2026-10-23 — Argentine mobiles are addressed without the "9" in WhatsApp sends

- **Meta's recipient form differs from the stored number.** An Argentine mobile is stored in E.164 as 549 + area + number. Meta accepted a test send only to 54 + area + number: the same number with the 9 was rejected as "not in allowed list" (code 131030), and the one without it was accepted. The contact in Meta's response still shows the 549 form.
- **The fix lives in the adapter.** `metaRecipient` in `whatsapp-cloud-sender.ts` drops the 9 for 549-prefixed numbers only. The domain normalizer keeps full E.164, so every other use (wa.me links, stored contacts, CAPI hashing) is unchanged.
- **Open question.** Whether Meta accepts the 9 form for real customers once they are on the allowed list is not confirmed; the adapter sends the form Meta accepted in the test.

## 2026-10-23 — Guide redesign: role entry, store theme, guided steps

- **Three options combined from the 20-option proposal:** the home page asks who the reader is (shopper, owner, client) with three tiles; the guide uses the demo store's type (Inter for body and headings, text colour #111111) with the demo store's palette (primary and text #111111, accent #d62828, surface #f5f5f5, white background) and a primary-colour header; every top-level numbered list shows as guided steps.
- **CSS only.** `docs-site/src/styles/guide.css` carries the look and re-skins the whole guide by changing `--guide-primary`. Step cards come from CSS counters on `.sl-markdown-content > ol`, so existing Markdown needs no changes. No new dependency; Inter loads from Google Fonts through `head` links in `astro.config.mjs`.
- **Content touched:** `admin/reports.md` ("Choosing the period" is now three steps, es and en). The English page also gained the CSV step the Spanish one already had.

## 2026-10-23 — Storefront restyle: one quiet, editorial system

- **Why.** The first pass changed colours and fonts but left the composition generic: small type, no hierarchy, dead space, controls far from their content. This pass restyles the storefront as one system. No new dependencies; no hardcoded text (the footer wordmark and the card initial reuse the store name and product name).
- **System.** One 1280px container (`max-w-7xl`, 20px gutters on phones, 32px on laptops). Page and section titles are display type (`text-3xl md:text-4xl` for pages, `text-2xl md:text-3xl` for sections, tracking -0.03em, set once on `h1`/`h2` in `global.css`); the first version used 60px page titles and was judged too big. Small uppercase labels use the new `eyebrow` utility. Large surfaces use `rounded-card` (1.5rem); controls keep the theme's corner radius, chips and search use full pills. Section rhythm on the home page is 64px on phones and 96px on laptops. Borders are hairlines (`border-text/10`).
- **Carousel.** Banner controls now float inside the slide (bottom right) instead of a detached row; other carousels group the arrows on the right under the track. Controls are hidden when there is one slide. The dots became small bars (the 44px hit area is unchanged).
- **No-picture state.** A product or product page without a picture shows the product's first letter large and faint on the tinted tile, so a store that has not uploaded photos yet still looks intentional.
- **Product page.** The buying column is sticky beside the gallery; options are pills (the chosen one is filled); "Ask on WhatsApp" is an outline button with an icon instead of a green block; the floating WhatsApp button is the text colour (a dark circle), not brand green.
- **Cart and forms.** Inputs are 48px high; the cart summary is a card that sticks while the lines scroll; checkout and cart buttons are 56px.
- **Footer.** Compact: the store's name and details, a menu and a legal column side by side on every size, and the copyright. The first version added an oversized wordmark; it was removed because the footer was too tall. The columns are one list in `Footer.astro` and each link is `FooterLink.astro`.
- **Not touched.** The admin, the emails and the PDFs keep their own styles. The demo hero banners still use earthy pictures from the earlier demo look.

## 2026-10-23 — Audit, second round

What was checked beyond the first round: every admin API route without a session (52 of 52 refuse), an editor against every owner-only screen and action, deactivated and expired sessions, open-redirect payloads on `next`, the order and payment rules, the D1 rules of CLAUDE.md, translations, 360 px layouts and touch targets on 31 pages, Lighthouse on 11 admin pages, and the guide's links and labels.

- **Owner-only screens answer 403.** Users, settings groups, failed jobs and WhatsApp showed the "no permission" text with status 200. They now also answer 403. No data was ever shown to an editor; this is for correctness.
- **A payment that arrives for a cancelled order is logged.** `ConfirmPayment` does not revive a cancelled order (its stock may be sold), and until now it also said nothing. It now logs `payment.late_for_cancelled_order` (order number, provider, reference, amount) so the owner can refund it in the provider's dashboard. Dead-letter and alerting rules can match that event name. Still open: it is a log line, not a screen or an email.
- **Paged lists end with a unique column.** The default "featured" sort, the media library and the stale-order query ordered by a timestamp alone, so rows created in the same instant could repeat or vanish between pages. `, id` was added to each.
- **One query for removed attribute values.** Saving an attribute ran one query per removed value; `anyValueInUse` takes the list in one `json_each` parameter, and the one-by-one method is gone.
- **Accessible names follow the page language.** The carousel arrows, the main and mobile navigation and the breadcrumb were English on Spanish pages. They use `nav.*` keys now, and `Carousel` takes `previousLabel` and `nextLabel` from its caller.
- **Default accent `#cf3426`** (was `#e03b2e`): white text on the old value measured 4.34:1 on the sale badge, below 4.5. The new one gives 5.03:1 on white and 4.57:1 on the tinted surface. Changed in the schema default, the CSS fallbacks and the demo theme.
- **Touch targets of 44 px in both directions.** `BUTTON`, `LINK_BUTTON` and the footer links gained `min-w-11`; the arrows in the category manager were 25 px wide.
- **A neutral favicon.** The store shipped the Astro rocket as its icon. `public/favicon.svg` is now a plain bag that follows dark mode, `favicon.ico` is rendered from it, and the guide uses the same file.
- **Guide labels corrected** on the test-accounts page ("Presentar en Meta", "Actualizar estado", "Enviar prueba a mí").
- **Checked and fine:** the order state machine (final states, stock released on cancel), server-side repricing in `PlaceOrder`, amount and currency matched before a payment is applied, CSV formula guard on every export, query plans of the hot queries (all use an index), 1,201 translation keys with identical placeholders, no horizontal overflow at 360 px, admin Lighthouse 99 to 100.
- **Not checked:** payments and messages against the real providers (see TESTING.md), load behaviour, and the unfinished stages 18, 19, 20 and 25 beyond what exists.
- **Contact page has no form (owner's decision).** The page shows the ways to reach the store as cards (`ContactCard.astro`): WhatsApp first as the dark main action, then email, phone, address and opening hours, then social links, the map and the Google reviews. The form's backend (`/api/contact`, the admin Messages page, the message jobs) and `ContactForm.tsx` are still in the code, unused by the page; remove them in a separate change if the form is not coming back. The `contact.form*` and `contact.send*` dictionary keys are unused for now.
- **Footer is shorter:** on phones the menu and legal links sit side by side; padding and margins were cut on every size, and the wordmark is smaller (12vw).
- **Type rhythm in tokens.** Title weight, tracking and leading, body leading and the small-label (`eyebrow`) size, weight and tracking are custom properties in `global.css`, as the project's CSS rule requires; the title and eyebrow rules read them.

## 2026-10-23 — Audit, third round

- **A payment for a cancelled order now reaches the store team.** `ConfirmPayment` still does not reopen the order, and still logs `payment.late_for_cancelled_order`; it now also queues `payment_late_store` (bilingual email to the order-notification address, falling back to the contact email). The reference is the provider event (`late:<provider>:<eventId>`), so a retried webhook queues nothing new, and a failure to alert is logged (`payment.late_alert_failed`) and never fails the webhook. Verified on the dLocal Go sandbox: order placed and cancelled, test card paid on the hosted page, signed webhook delivered, order stayed `cancelled`, one email, none on the repeat.
- **dLocal Go `order_id` is `<number>-<first 8 characters of the order id>`.** The bare number clashed (error 5009) when two databases shared one account. Nothing reads `order_id` back; payments are found by their own `DP-` reference.
- **The feed has a target.** `/feeds/products.xml` stays Meta's spelling (`in stock`); `?target=google` writes `in_stock`; an unknown target answers 404. `FEED_TARGETS` lives next to the builder. Not confirmed from Google's pages whether it also accepts the spaced form, so Merchant Center's diagnostics have the last word.
- **The sign-in redirect keeps the query string.** `next` carries `path + search`, and `safeAdminPath` accepts `/admin?...`; it still refuses anything outside `/admin`.
- **Tests moved into the repo:** `npm run test:access` (anonymous access to every admin route; editor, deactivated, expired and unknown sessions) and `npm run test:consent` (Pixel off before a choice and after "Only necessary", on after "Accept", choice persists).
- **Left open on purpose:** refunds stay recorded, not made (a refund call or a PayPal refund handler moves money and cannot be checked without live refunds); the dev-only `braces` finding (no patched release on npm); real email, WhatsApp and Meta round trips (need the client's accounts); a deployment (needs the owner's login).

## 2026-10-23 — Demo login uses Cloudflare's test Turnstile secret

- **Why.** The demo's login page loads the test Turnstile site key (`1x00000000000000000000AA`), but the Worker had a real Turnstile secret, so every login failed the bot check before the password was read. The demo owner could not sign in.
- **What.** The demo Worker's `TURNSTILE_SECRET_KEY` secret is now Cloudflare's test secret (`1x0000000000000000000000000000000AA`), which matches the test site key. Login works.
- **Consequence.** The public login page has no real bot protection on the demo. This is for the demo and the template only. A real store needs a Turnstile widget of its own: its site key in `clients/<slug>/client.jsonc` and its secret set with `wrangler secret put TURNSTILE_SECRET_KEY`.

## 2026-10-23 — Legal pages: summary first, rights block, placeholders filled

- **Layout (the owner's pick, "Summary first").** Privacy, terms and shipping pages are a narrow column: a small "Legal" label, the title (24–30px), who the seller is and the date, an "In brief" panel of three plain-language lines, the clauses (h2, 18–20px), and in the privacy policy the "Your rights" clause as a dark block with a button that writes to the store's email.
- **Built from page sections, not hardcoded.** Two new page-builder widgets: `summary` (a title and up to six lines) and `callout` (title, text and an optional button). The default legal pages are lists of sections in `defaults/legal-pages.ts` (this replaces `legal-texts.ts`), so an owner can edit the summary and the block in the page builder like any other section. The summary lines are short, faithful restatements of each page, written for the defaults and reviewed with the rest of the text by the client's lawyer.
- **Bug fixed: `{{placeholders}}` were shown raw.** `fillPlaceholders` existed but nothing called it, so the live pages showed `{{storeName}}`, `{{address}}` and so on. `fillSectionPlaceholders` now fills every text of a page's sections when the page is shown (store name, address, contact email, country name, and the date the page was saved). A value that is empty stays as its placeholder, so a missing setting is noticed.
- **Bug fixed: the title appeared twice** (the page title and a `##` heading inside the text). The default text no longer starts with a title; the clauses are `##` headings, and `###` headings in older stored text are styled too.
- **Links may open an email.** The `link` field accepts `mailto:` as well as `/` and `https://`.
- **Shared link button.** `CtaLink.astro` is the one pill link with an arrow, used by the hero, the promo banner and the callout.
- **Existing stores keep their old text** until `node scripts/refresh-legal-pages.mjs --remote` (or `--persist-to <folder>` for a local database) is run after the new version is deployed. It replaces the three pages with the defaults, so run it only on stores that did not edit them. Run it before deploying and the pages would lose their text, because the old version does not know the new widgets.
- **Headings one step smaller storefront-wide** (page titles 24–30px, section titles 20–24px, hero 30–48px).

## 2026-10-23 — Demo e-mail is sent from the store's own subdomain

- **Why.** The demo sent from `orders@example.com`, a placeholder domain not owned by the Cloudflare account. Cloudflare refused every send with "domain is not owned by the same account", so no store e-mail (weekly summary, orders, password reset) could reach anyone.
- **What.** Email Sending is enabled for `ecommerce.relion-app.com` (zone `relion-app.com`). Its SPF, DKIM and DMARC records resolve publicly. The demo's `EMAIL_FROM` is now `Store <orders@ecommerce.relion-app.com>`. A test weekly summary to the owner's mailbox reached `sent`.
- **Template.** A client with its own domain repeats this: `wrangler email sending enable <domain>`, publish the DNS records it returns, then set `EMAIL_FROM` in `clients/<slug>/client.jsonc`.

## 2026-10-23 — Admin redesign, first screens: header with Menú and search, Panel, Productos

- **Owner's picks.** Header: a mega "Menú" panel plus a search box that jumps to any page. Panel: two columns. Productos: picture grid and bulk rows. The other screens' picks (Pedidos split view, product editor with live preview, order receipt, categories two panes, media grid with preview, inventory with movements, settings two panes, reports list plus comparison) are recorded in the project notes and built one screen at a time; until then those pages keep the old look.
- **Header.** `AdminTopBar.astro` holds the store name, the search (Ctrl K, filters as you type, plain links without JavaScript), the Menú panel (five sections: Catálogo, Ventas, Contenido, Mensajería, Tienda) and sign out. The menu is one list, `ui/admin/lib/nav.ts`, which also gives `AdminLayout` the breadcrumb ("Ventas / Pedidos"). A new admin page is added to that list once.
- **Panel.** Left: the 14-day chart, the six newest orders (new `recentOrders` in the dashboard snapshot, one more statement in the existing batch, ordered by `created_at DESC, id DESC`) and the top products. Right, sticky: Hoy, Alertas and the 7 and 30 day periods, reduced to sales and paid orders. `AdminCard` and `AdminStatList` are the shared pieces. `LineChart` takes a `width` so a wide card gets a flat chart.
- **Productos.** `?view=grid` (default) or `?view=rows`, switched with `ViewSwitch`. Each product has a selection box; `ProductBulkBar` (island) publishes or unpublishes the selection through `POST /api/admin/products/bulk-status`, which changes all ids in one `UPDATE … WHERE id IN (json_each) RETURNING id`: repeats and unknown ids are ignored, up to 100 ids. The list row now carries `imageKey` (the stored size nearest 480 px) from the same query.
- **Table edges.** `admin-table.css` pads the first and last cell by 1.25rem so a table lines up with the title of the card that holds it.

## 2026-10-23 — Deep audit: every link, filter and action

Ten test files now live in `scripts/test/` (`npm run test:all`). They drove these fixes:

- **The "out-of-stock products" setting did nothing.** Settings > Catalog offered "At the end / Hide them / Like any other", and "Show stock on the product" with a low-stock threshold, but no code read them. Now: `showOutOfStock: 'hide'` leaves unavailable products out of lists, counts, facets, search suggestions and related products (never out of the product page itself, so a bookmarked link still explains); `'last'` orders them after the others inside the chosen sort; `'normal'` is as before. One definition of "can be bought" (`IN_STOCK_SQL`) serves the filter, the facets and the setting. The product page says "Only N left" at or below the threshold, "N in stock" when the setting is "always", and plain "In stock" otherwise. The sitemap and feed still list everything.
- **A page past the last one redirects to the last page** (301, same filters) instead of answering 200 with "No products match your filters" under an indexable URL. A category with no filters redirects to its first page.
- **A long search no longer crashes the admin lists.** D1 refuses a LIKE pattern over 50 bytes ("pattern too complex"), so a search of about 80 characters on Orders or Invoices was a 500. `containsText` uses LIKE when the pattern fits and `instr(lower(...), lower(?))` when it does not; both match anywhere in the value and ignore ASCII case.
- **The language link keeps the filters** on shop pages (`switchSearch`): attribute values, prices, flags and sort mean the same in both languages; the search text and the page do not and are dropped. The `hreflang` tags stay free of any query.
- **`tel:` links no longer contain spaces.** `telLink` keeps digits and a leading "+". The display text stays as the owner typed it.
- **A skip-to-content link** is the first Tab stop on every page (`BaseLayout`), and each layout's `<main>` has `id="main"`. Keyboard users had to tab through the whole header on every page.
- **Guide:** the contact page, the overview and the launch checklist describe the contact cards, not a form; the Messages screen and its screenshot are gone from the admin and the guide.
- **Found and left as designed:** an order refunded within seconds of payment, before the invoice job runs, gets no invoice (only paid orders do); saving a product twice with the same "stock before" applies the stock change twice (a sale made while the form was open must not be undone); the editor reloads its numbers after a save.
- **Left for the owner:** the contact form's backend was removed by the other session (`/api/contact`, the Messages page); the `contact_*` email templates and the `contact_messages` table are still there and could go in a separate change.

## 2026-10-23 — Admin redesign, the remaining picked screens

- **Pedidos: split view.** A wide screen shows the list on the left and the chosen order on the right (`?order=N`, the first order of the page when none is named); a phone shows the list and each order opens on its own page. The link goes to the order's page and a small script sends a wide screen to the pane URL, so everything works without JavaScript. The paging links drop `order`.
- **Detalle del pedido: one document.** `http/admin-order-view.ts` loads everything about an order once and `OrderDocument.astro` draws it as a receipt (customer, items, totals, payment and delivery) with the actions (status, WhatsApp, customer link, invoice) in a rail, and the timeline, origin and messages below. The order page and the list's side pane use the same component, which sizes itself with container queries (the rail sits beside the document from 56rem of available width).
- **Editar producto: live preview.** `ProductPreview.tsx` draws the store card from the editor's form state (picture, name, price tag, sale badge, category) in a sticky column. It mirrors the storefront card instead of importing it: the real one is a server component.
- **Categorías and Atributos: two panes.** The tree (or the attribute list) on the left, the editor on the right; a row is a button that opens its editor. A category row keeps its reorder arrows.
- **Multimedia: grid and preview.** Choosing an image shows it larger on the right with its name and the delete action. There is no alt-text field: the library has the column but no endpoint to write it yet.
- **Inventario: movements beside the table.** The eight latest stock changes, as a timeline (`StockMovementList`), through the existing movements query.
- **Configuración: two panes.** `/admin/settings` redirects to the first group; each group opens its form next to the list of groups (`SideMenu.astro`, shared with the reports). Envíos and WhatsApp keep their own pages and the new card look.
- **Reportes: list and compare.** The report list is a column on the left (a scrolling row on a phone); `?compare=1` shows each indicator beside the previous period and the change, from the same read as the summary.
- **Shared look.** The class constants in `ui/admin/lib/classes.ts` (`PANEL`, `TABLE_WRAP`, `FIELD`, the buttons, `BADGE`) and every inline `rounded-brand bg-surface` in the admin became the bordered white card used by the new screens, so the pages that were not redesigned (invoices, logs, jobs, users, testimonials, pages, emails, shipping, WhatsApp) match.
- **Select arrows in the admin.** The browser's arrow is replaced by one chevron, drawn from custom properties (`--select-chevron` and its size, inset and padding) in `global.css`, for every `select` inside an element with the `admin` class (the admin layout's `main`). One rule covers the 24 selects, in Astro pages and Preact islands. The arrow is an image, so its stroke is a fixed mid grey.

## 2026-10-23 — Contact form leftovers removed

- **Migration 0004 drops `contact_messages`.** Nothing writes to it or reads it since the contact page lost its form, and it held no rows on the live demo store (checked with a read-only count before the migration). The code, the Messages screen and the `contact_*` emails were already gone; the table and the guide's "unread messages" mentions were the last traces. A form that comes back brings its own migration.
- **Alt text for images.** The media panel has an alternative text field per language; `POST /api/admin/media/alt` stores it through `MediaLibrary.updateAlt` (200 characters per language, an empty language is dropped). The product page already read the stored text, so it appears in the store with no other change. Tested against the local store: trimmed on save, refused at 201 characters, unknown image refused, the Spanish product page showed the text.

## 2026-10-23 — Refunds from the admin

- **Owners only, full payment only, from `paid` only.** Permission `orders.refund` (owner). The order state machine allows `refunded` only from `paid`, so the button shows only there; cancelling a paid order does not send money back. Partial refunds stay in the provider's dashboard.
- **One request per order, claimed first.** `RefundOrder` records `refund-request:<order id>` in `payment_events` with `recordIfNew` before calling the provider, because dLocal Go has no idempotency key. A refusal (4xx → `REFUND_REFUSED`) forgets the claim so the owner can retry; an unknown failure keeps it (the money may have moved) unless the gateway says repeats are harmless (PayPal sends `PayPal-Request-Id`).
- **Same path as the notification.** The order becomes `refunded` through `ConfirmPayment`, whether PayPal answers COMPLETED at once or dLocal Go's notification arrives later, so a refund is applied once however it is reported. The timeline gets a `refund_requested` entry with the provider's refund id.
- **dLocal Go reports refunds in the buyer's currency** (USD payment, COP refund), so amounts cannot be compared. `PaymentConfirmation.foreignCurrencyRefund` marks that case and `ConfirmPayment` accepts it only when the store's own claim exists; a dashboard refund in another currency is logged (`refund.foreign_currency_not_requested`) and left for the owner. Found on the sandbox: without this the order stayed `paid` for ever.
- **Local sandbox needs a manual webhook.** The notification URL is `PUBLIC_SITE_URL`, not the local store; deliver it with `npm run test:webhooks`. A refund rejected later by the provider needs manual recovery.
- **Checked on both sandboxes:** PayPal refund through the real button (capture refund, immediate); dLocal Go REF-2585 and REF-2586 completed by signed notifications; a repeat notification changed nothing; two simultaneous clicks reached the provider once.

## 2026-10-23 — Stage 20 closed with a report-figures test

- **`scripts/test/reports.mjs`.** The existing tests only proved that report pages and CSVs answer. This one recomputes the figures with separate SQL (the sales report in total, by day, week and month; payments and shipping per method; invoices; tax per rate; products; the top customer), the change against the previous period, the 360px layout and the weekly-summary schedule, and passed 31/31 on the demo database.
- **Weekly summary: once per store-local day.** The tick that matches the configured weekday and hour enqueues the job; its notification key names the day, so a second tick (or a re-run the same day) sends nothing. The test clears earlier `weekly_report_store` log rows first to be repeatable.
- **Not checked here:** opening a CSV in Excel or Sheets themselves. The file carries a UTF-8 BOM, and a semicolon/decimal-comma variant exists for Spanish Excel; both are tested.

## 2026-10-24 — WhatsApp tested locally against a fake Graph API

- **`scripts/test/fake-graph.mjs` and `npm run test:whatsapp`.** Stage 18's "Done when" needs a real WhatsApp test number, which this repository cannot supply. Everything that does not depend on Meta's decisions is now checked locally: save, submit, review, sync, the shipped message with tracking code and order link, the invoice as a PDF document, signed delivery statuses, and every reason a message is skipped. 52 checks pass. The fake applies the template rules Meta documents, which caught nothing in the store but did catch two mistakes in the fake itself while writing it (a trailing period after a variable is allowed).
- **The demo store always talks to the fake.** `docs:store` passes `META_GRAPH_BASE_URL` and `META_APP_ID` with `--var`, which wins over `.dev.vars`, so the local demo cannot call Meta even if real keys sit in `.dev.vars`.
- **Stage 18 stays unticked.** A real test number is still needed to see the message arrive on a phone and the template go through Meta's review.

## 2026-10-24 — Stage 20 ticked without the WhatsApp weekly summary

- **What is left out.** The weekly summary is sent by e-mail only. The short WhatsApp version in the plan is not sent: its Meta template is not submitted or approved, and the owner chose to leave WhatsApp out of this stage.
- **What was checked.** The scheduler sends the summary at the configured weekday and hour (tested with a local slot). The e-mail arrives from the store's subdomain with status `sent`. The Spanish-Excel CSV opens in a Spanish-locale spreadsheet, with the BOM, `;` separator and decimal commas. The summary e-mail fits a 360 px screen with no horizontal scroll. The button and the footer link are under the 44 px touch target, which is a known gap in the e-mail layout.

## 2026-10-24 — Audit fixes: settings validation, webhooks, small UI items

- **Settings refuse values the platform cannot use.** The time zone must be one Intl knows, the country a region Intl names, the contact email an address (or empty) and each social link an `https://` address (or empty); `src/domain/shared/validators.ts` holds the checks. A time zone typo used to be saved and then made every admin page that formats a date answer 500. Page-builder links no longer accept `//host` or `/\host` (browsers read them as another site). The new codes (`INVALID_TIMEZONE`, `INVALID_COUNTRY`, `INVALID_EMAIL`, `INVALID_LINK`) and the three older ones that had no text (`LINK_HREF`, `DIGITS_ONLY`, `MAPS_EMBED_URL`) are translated in `errors`.
- **A stored value that no longer passes drops only itself.** `D1SettingsRepository` used to reset the whole group to defaults when one field failed its schema, so adding a rule would have wiped every other field of a store's saved group (a social link saved as `instagram.com/x` would have reset the store's phone and address). It now removes the failing fields and parses again; the group's defaults apply only if that still fails.
- **Webhooks are rate limited and capped.** `readWebhookBody` (`src/http/webhook-body.ts`) applies a per-provider counter in the `api` bucket and reads at most 128 KB before the signature check. PayPal's check calls PayPal's API, so an unsigned flood used to cost outbound calls; a body that is not JSON is now refused (400) instead of failing with 500.
- **The demo seed waives shipping at 50.00, as the banner says.** `ship-flat` had 80.00 while the announcement and the home promo promised 50. The promo's English title says "from 50", like the Spanish one and like the rule (`>=`). Existing databases keep their value: change it in Shipping.
- **Free shipping says "Free"** in the options and the summary (`checkout.shippingFree`), not a dash or 0.00.
- **Plurals.** `t()` uses `<key>One` when `count` is 1 ("1 product", "1 review", "1 unit"). Only the three server-rendered strings that showed "1 units" and the like have a singular so far; add `…One` keys as other counts need them.
- **Touch targets.** The Grid/Rows and Summary/Compare switch and the product-selection checkboxes now have 44 px hit areas.
- **Housekeeping.** One `constantTimeEqual` (the domain one); `theme-color` follows the store's primary colour; the skeleton shimmer uses a token; README status and feature list match the code.
- **`npm audit --omit=dev` is clean again through an override.** `undici` 7.29.1, pinned inside `miniflare`, has three advisories fixed in 7.30.1; the newest `miniflare` still pins 7.29.1. `package.json` overrides `miniflare`'s `undici` to 7.30.1 (it is local-emulation tooling and never part of the Worker). Remove the override when `miniflare` pins a patched version.
- **Tests.** `admin-actions` now expects the bad time zone, country, social links and email to be refused (and not stored); the two checks that expected `/admin/settings` to be a page follow the redirect to the first group.

## 2026-10-24 — Legal acceptance checkbox and accessible consent banner

- **Privacy and terms checkbox on every store.** The checkout and the back-in-stock form carry an unchecked, required checkbox ("I have read and accept the privacy policy and the terms"). It applies to all stores, not only EU ones: one flow, no jurisdiction setting to get wrong. If a client needs it off, make it a `legal` setting then. The server enforces it too: `acceptedLegal` is `z.literal(true)` in `placeOrderInput` and `subscribeInput`, so a request without it is refused with `VALIDATION_FAILED`.
- **One component.** `LegalAcceptance.tsx` renders it; `legalAcceptanceFor(locale)` in `ui/lib/legal-acceptance.ts` builds its text and links. The sentence is one dictionary string with `{privacy}` and `{terms}` placeholders (`legal.accept`), so the word order can differ per language. The links open in a new tab so the shopper keeps the form.
- **The contact page has no form** (visitors write on WhatsApp or by email), so it has no checkbox. If a form is added there, use `LegalAcceptance`.
- **Not stored yet.** The acceptance is checked but not recorded on the order or the subscription. If a client needs proof of consent (who, when, which text version), add a column and a migration.
- **Consent banner is a named region.** `role="region"` with `aria-label` from `consent.title`. It is not a modal dialog: the page stays usable behind it.
- **Test scripts** that place orders send `acceptedLegal: true` (`smoke`, `orders`, `whatsapp`, `screenshots`, `demo-data`).

## 2026-10-24 — Google Analytics 4

- **GA4 runs under the existing marketing consent.** No separate "analytics" category: one banner, one choice. `ga4MeasurementId` (Settings > Marketing, `G-…`, empty = off) loads `gtag.js` only after the visitor accepts, exactly like the Meta Pixel. A GA4 id alone also makes the banner appear in `auto` mode (`isMarketingToolEnabled`). No Google request is made before consent.
- **Where.** `ui/lib/ga4.ts` loads gtag and sends events; `track()` calls it next to the Pixel. The store's event names are GA4's recommended names, so they go through unchanged. Page views are sent by hand (`send_page_view: false`) so each `track('page_view')` counts once. Value goes out in major units, as for the Pixel.
- **Known gap, shared with the Pixel.** The browser fires only `page_view`, `view_item` and `add_to_cart`. `begin_checkout` and `purchase` are not fired in the browser (the purchase reaches Meta only through the Conversions API), so GA4 has no purchase or checkout funnel yet. Closing it means firing `begin_checkout` on the checkout page and `purchase` on the confirmed order page with `transaction_id`, which also changes what the Pixel receives.
- **CSP.** The store's `script-src` (Astro `security.csp`, see "Security audit fixes") is a host allowlist, so GA4 needs `https://www.googletagmanager.com` in it (gtag.js) and the Pixel needs `https://connect.facebook.net` (fbevents.js); both are in `astro.config.mjs`. Without them the browser blocks the scripts and no event arrives, with no error on the page. The policy has no `connect-src` or `img-src`, so the collect calls to Google and Meta need no entry; if those directives are added later, allow `*.google-analytics.com` and `www.facebook.com`.

## 2026-10-24 — GA4 and Meta purchase funnel

Closes the gap noted in "Google Analytics 4" above (no `begin_checkout` or `purchase` in the browser).

- **`begin_checkout` from the checkout page.** One event per page load that has cart lines (`trackBeginCheckout`). It goes to the Pixel (`InitiateCheckout`), GA4 and the first-party store, like the other browser events. Value and prices come from the browser's cart: this is analytics, the order is priced by the server.
- **`purchase` from the order page, only when paid.** Not when the order is created: an order that is never paid, or later cancelled, would inflate sales in GA4 and Meta. The page renders the order in a `data-purchase` attribute only for `paid`, `processing`, `shipped` and `delivered` orders paid in the last 48 hours (Meta only deduplicates within 48 h, so an old order opened from an email in a new browser must not be sent again). The browser sends it once per order (`localStorage` marker), after marketing consent. A page that loads before the webhook confirms the payment sends nothing; a later visit does, and the server path below covers the rest.
- **One event id per sale.** `purchaseEventId(orderId)` (`purchase-<id>`) is a domain function used by the Conversions API job and the browser, so Meta counts the sale once. GA4 uses the order id as `transaction_id`.
- **Server-side GA4 purchase (Measurement Protocol).** `ReportPurchase` queues `marketing.ga4_purchase` next to the Meta job; each platform has its own try, so a failure on one never stops the other. It runs from `ConfirmPayment`, the single point every confirmation passes through (webhooks, PayPal capture, the owner marking an order paid), so bank transfer, cash on delivery and WhatsApp orders are counted when the owner confirms them. The browser's purchase and the server's share the `transaction_id`, and GA4 counts a transaction id once.
- **Consent decides everything.** The checkout endpoint reads GA4's `_ga` and `_ga_<id>` cookies only when the buyer granted marketing, and `placeOrder` drops them otherwise. They are stored in `orders.ga_client_id` / `ga_session_id` (migration `0005_order_ga_identity.sql`) and are NULL without consent. An order without a client id (the buyer accepted marketing after reaching checkout) gets no server purchase and is left to the browser's.
- **Secret.** `GA4_API_SECRET` (Worker secret, per client, never in settings: settings are visible in the admin). Without it the job is skipped and logged. The secret travels in the query string as Google requires, so the sink never puts it in an error message or a log. Google answers 2xx even for a body it does not understand, so a purchase that never appears is a data problem: check it in GA4 DebugView after the first live order.
- **Not done.** Not tested against a live GA4 property (no measurement ID or API secret in this repo): the body and the sink were checked with a test double, and the first live order must be checked in GA4 DebugView. The acceptance of the privacy policy is still not stored on the order. The line in `docs/ANALYTICS.md` that said `purchase` is "never from the browser" now refers to the first-party store only.
- **Deploy order matters.** The migration must run before the new Worker (`deploy:client` already applies remote D1 migrations first).

## 2026-10-24 — Performance audit fixes

Measured on a copy of the demo database grown to 5,000 products (SQLite, so query time only; D1 adds a network trip per query).

- **Paged lists find the page's ids first.** The shop listing and the admin product list sorted every match with all their card subqueries computed. `CatalogQueryService.listProducts` and `D1AdminCatalogQueries.listProducts` now pick the ids in a `WITH page AS (...)` from the filter and sort alone, then load the card columns for those ids. The default `showOutOfStock = 'last'` ordering went from 25 ms to 4 ms, the admin list from 22 ms to 1 ms, and deep pages from 13 ms to 1.4 ms; rows and order are identical to the old query in all 27 cases compared. The rows and the total share one `db.batch`.
- **`listTopProducts`** is the card list without a total. Featured sections on the home page used `listProducts` and threw the `COUNT` away; they also ran one after the other. They now run side by side, and the section pictures load in the same step as the categories.
- **Fewer sequential trips on a cache miss.** Product page: product, then everything else at once (alternates, pictures, categories, attribute values and variants with their labels), then the related products as one statement (`loadRelatedCards`). The shop pages load the category list with the listing; the category page looks up the category while it loads the listing; the home, content and contact pages read the settings and the stored page together; a cart quote reads variants and shipping methods together. `loadQuoteVariants` reads rows and labels in one batch, and `loadProductVariants` selects by product so the page needs no id list first. `OrderRepository.load` also reads the order and its items in one batch.
- **Lists of ids travel as one JSON parameter** (`IN (SELECT value FROM json_each(?))`) in the catalog reads, as CLAUDE.md asks. This also fixes the product feed, which bound one parameter per variant and would have failed on D1 (100 parameters per query) for a store with more than 100 variants: `feedVariantAttributes` now selects the variants in SQL.
- **The page-cache key keeps only the parameters a page reads** (`STOREFRONT_QUERY_PARAMS` in `catalog-query.ts`, sorted). `utm_*`, `fbclid`, `gclid` and any random parameter no longer make a new entry, so an ad click is a HIT and nobody can force a render per request by adding `?x=random`. Add a name to the list when `parseCatalogQuery` starts reading one. The shop pages still redirect unknown parameters to their canonical URL (an uncached 301).
- **Images go through the edge cache** (`src/http/media-cache.ts`). The first request in a location reads R2 and stores the file with `caches.default`; later ones skip R2, and a request with a matching `If-None-Match` gets a 304. The Worker still runs for each image: to avoid that, serve media from an R2 custom domain (`PUBLIC_MEDIA_BASE_URL`, see the entry "Pictures from an R2 custom domain" below; the note that `mediaUrl` already supported it was wrong, the variable was declared but nothing read it) or a Cache Rule on `/media/*`. A deleted image can stay in a location's cache until that location evicts it; only unused images can be deleted.
- **Product pictures have `srcset`.** `ProductDetailDto.images` carries each picture's sizes; the main image (the page's LCP) and the gallery use `srcset` and `sizes`, so a phone no longer downloads 960 px for a 360 px slot.
- **`browserCacheSeconds`** on `defineEndpoint`: the search suggestions and the live result count let the browser keep an answer for 60 s. Every other endpoint, and every error, still answers `no-store`.
- **`ExpireStaleOrders`** reads the expired orders in one batch (`OrderRepository.findByIds`) instead of one query each, no longer stops at the first failed cancellation (it returns `{ cancelled, failed }` and logs `orders.expire_failed`; a failed order stays pending and the next 15-minute tick tries it again), and a failure after a cancellation committed (stock alerts, the customer's email) is logged without hiding the other orders. `InvoiceAttachments.load` reads its references side by side.
- **Category page.** `getCategoryAlternates` now takes the language and slug from the URL instead of the category id, so the category, its other-language slug and the listing are read together (one trip fewer). The scheduler tick reads its three KV markers and the two settings groups together. It now queues a job first and writes its marker after: with the marker first, a failed queue call left the marker saying "done" and the job skipped for its whole period (6 to 24 hours). The price is that a marker write failing right after a successful queue lets the next tick queue the job again. The queue does not deduplicate (the idempotency key only travels in the message), so this relies on the jobs being safe to run twice: the daily rollup is an upsert, the purge deletes rows that are already old, the review refresh overwrites its copy, the weekly summary is deduplicated by its notification key, and the demo reset restores the same snapshot. Each job is attempted on its own and the first failure is raised at the end, so one bad job no longer holds back the rest of the tick.
- **Feed checked at scale.** On 9,452 active variants the old attribute read would have bound 9,452 parameters (D1 allows 100 per query); the new one reads 4,702 attribute rows in 10 ms with none.
- **Not changed.** The `strftime` calls in the dashboard and report queries only group already-filtered rows (the `WHERE` uses timestamp ranges), the status lists in `dashboard-queries` and `reports-sql` are fixed-size, and `settings.get()` still parses its group on every call (microseconds; the rows are read once).
- **Checked.** `npm run check` and `npm run build` pass. On a private copy of the demo store: 40 checks of pages, filters, sorts, the product page, the cart quote, the cache keys, media (200, repeat, 304, 404), the feed and the admin product list; and the expiry job cancelled three expired orders with their events, stock and emails. The stage suites (`npm run test:all`) were not run: they share `.wrangler/docs-cookie.txt` and the demo data with other work in progress.

## 2026-10-24 — Security audit fixes

- **JSON-LD could close its own script tag.** `serializeJsonLd` was meant to turn `<` into its six-character unicode escape (a backslash, `u` and four hex digits), but the escape had been lost and the code replaced `<` with `<`, so a product name of `</script><script>…` ran on the public product page. That let an editor run script in an owner's browser and invite themselves as owner. It now escapes `<`, `>`, `&`, U+2028 and U+2029 the same way. The backslash is built from a char code on purpose: tools that rewrite backslash sequences had already corrupted this file once.
- **Script policy (`script-src`).** Astro's `security.csp` is on: bundles and inline scripts are hashed at build time, plus `challenges.cloudflare.com` and `static.cloudflareinsights.com`. Astro sends the policy as a header on server-rendered pages, and `withSecurityHeaders` used to `set` its own CSP over it, which would have discarded the hashes. It now appends to the page's policy. `style-src` keeps `'unsafe-inline'` (components set style attributes). Checked in headless Chrome on the storefront, checkout, sign-in and ten admin pages: no violations, islands hydrate, an injected `<script>` and an `onerror=` handler are both refused.
- **No inline handlers.** The catalog sort used `onchange="this.form.requestSubmit()"`. `Select` now takes `submitOnChange` and a script attaches the listener. New inline handlers will not run.
- **Zod without compiled validators.** Zod probes with `new Function`, which the policy reports on every admin editor page even though zod catches it. `src/application/zod-config.ts` sets `jitless` and the schema modules import it first. Server-side nothing changes (Workers refuses the call anyway).
- **Roles checked in the use cases.** Catalog (products, categories, attributes), media and stock use cases take the signed-in admin and call `assertCan` (`catalog.edit`, `media.manage`, `inventory.adjust`). Both roles hold these today, so nothing changed for users; a third role would have had them all by default. `media.manage` is a new permission.
- **Sign-in costs the same for every failure.** An unknown or inactive email is checked against a fixed dummy hash, so timing no longer shows which emails have accounts.
- **Reset and invite links are spent atomically.** `PasswordResetRepository.claim` is one `UPDATE … RETURNING`; two simultaneous requests with the same link cannot both set a password.
- **Webhooks.** They use `readWebhookBody` (rate limit and 128 KB cap). PayPal's check also refuses a request without the five signature headers or with a certificate address outside `paypal.com` before it calls PayPal's API. `/api/health` shares the `api` limit.
- **Test Turnstile keys cannot be deployed by accident.** `deploy-client` refuses Cloudflare's test site key (`1x000…`) unless the client sets `"allowTestTurnstile": true`, which only the public demo does. The demo keeps its test key and secret, as recorded on 2026-10-23.
- **The invoice preview can be framed by the admin page.** `DENY` blocks same-origin framing too, so the admin invoice iframe would have been blank. That one document gets `SAMEORIGIN`, `frame-ancestors 'self'` and `script-src 'none'`.
- **No analytics beacon on order pages.** The order page and the payment-cancelled page carry the order key in the URL, so they no longer load Cloudflare Web Analytics.
- **Left as they are.** PBKDF2 stays at 100 000 iterations (the Workers maximum; the 12-character minimum and the sign-in limits cover it). The email order link still never expires, because it is rebuilt from the stored hash (see `access-key.ts`). Unpaid orders still hold stock until they expire (online hold and manual auto-cancel settings). The edge's HSTS max-age (180 days, set in the Cloudflare zone) is shorter than the Worker's one year and has no `includeSubDomains`; change it in the zone's SSL/TLS > Edge Certificates.
- **Tests.** `test:clients` now checks the Turnstile guard (refuses the template key, accepts an opt-in and a real key). Also run against a local build: `test:access` 28/28 and `test:admin-actions` 162/162.

- **Fix: the new script policy blocked GA4 and the Pixel.** `script-src` allowed only `self`, Turnstile and Cloudflare Analytics, so `gtag.js` and `fbevents.js` would have been refused as soon as a store set a GA4 ID or a Pixel and a visitor accepted marketing. The demo store has neither, so Lighthouse and the headless checks of the policy could not show it. Both hosts are now allowed. Anything new that loads a third-party script must be added to `astro.config.mjs` and checked with a visitor who accepted marketing.

## 2026-10-24 — Pictures from an R2 custom domain

- **`PUBLIC_MEDIA_BASE_URL` now does something.** It was declared in `wrangler.base.jsonc` and `new-client.mjs`, but no code read it; `mediaUrl()` took a base argument that no caller passed. `normalizeMediaBase` (`src/domain/media/media-base.ts`) reads it once per request into `app.config.mediaBaseUrl`: `https` only (plain `http` just for localhost, so a store never serves pictures a browser blocks as mixed content), no credentials, query or hash, trailing slashes dropped. An empty or unusable value gives an empty base, so a typo costs speed and never the pictures.
- **One place builds the address.** `PATHS.media(key, base)` is the single rule (the Worker's `/media/<key>` or `<base>/<key>`); `ui/lib/media-url.ts` (`mediaUrl`, `buildSrcSet`) and the product feed (`g:image_link`, new `mediaBaseUrl` input) both use it. The middleware hands the base to `ui/lib/media-url` on each request (`configureMediaBase`): a module value, safe because it comes from the Worker's environment and is the same for every request, not per-visitor state. Components therefore needed no change, and the JSON-LD, `og:image` and the `srcset` follow. `BaseLayout` adds `<link rel="preconnect">` to the media host so the first picture does not wait for DNS and TLS.
- **The Worker route stays.** `/media/...` still answers (old links, the admin's own thumbnails, a store that has not set the variable); the admin lists keep using it on purpose.
- **The bucket is not only pictures, so the host must be restricted.** The same bucket holds `invoices/<id>.pdf` and, on the demo, the e-mail outbox. An R2 custom domain serves every key, so a leaked invoice id would be a public PDF with customer details. `docs/NEW_CLIENT.md` (step 3.8) makes a WAF rule that blocks anything outside `/media/` a required step, with a check (a made-up `/invoices/x.pdf` must answer 403). A separate bucket for pictures would remove the dependency on that rule; it needs a second storage port and a migration of the existing objects, so it was not done.
- **Checked.** 34 unit checks (the validator's edge cases, the URL rule, `srcset`, the feed), and an end-to-end run on a private copy of the demo store with a fake host: every picture in the home, shop and product pages, the JSON-LD, `og:image` and the feed pointed at the host, `preconnect` was present, no `src` was left on `/media/`, and the Worker route still answered. Not checked: a real custom domain and the WAF rule, which need the client's Cloudflare account.

## 2026-10-24 — Purchase to Meta carries hashed email and phone

- **Decision (owner).** The Conversions API purchase carries the buyer's email and phone, as the Stage 19 plan says. The earlier reason for sending none (checkout did not record consent) no longer holds: `ReportPurchase` already returns before anything is queued for an order without `marketing_consent`, so a buyer who refused sends nothing, not even a request without personal data.
- **Hashing.** The sink hashes (SHA-256 of the normalized email, and of the phone with the store's default country code) just before the request, and never logs the values. GA4's purchase carries no personal data, only the visitor and session ids.
- **Where the raw values live.** In the job payload, so they are in the queue message and, if the send fails for good, in `failed_jobs.payload_json`, which only owners see in `/admin/jobs`. Resolved jobs are purged after 90 days; unresolved ones are kept. The order table already holds the same email and phone. Hashing before queueing would keep them out of the job, but the sink needs the store's country code to normalize the phone first, so that is a larger change; do it if a client asks for it.
- **Still not sent.** IP, user agent, `fbp` and `fbc` are null on the server purchase: the order does not store them. Meta matches on email and phone alone for these. Storing `fbp`/`fbc` on the order (like the GA ids) would add match quality; it needs a migration.
- **Set up for the demo store (2026-10-24).** In the account of `relion-app.com`: a WAF custom rule on the zone (block `media.ecommerce.relion-app.com` outside `/media/`; it is the zone's only custom rule), then the custom domain `media.ecommerce.relion-app.com` on the bucket `demo-media` (minimum TLS 1.2; the `r2.dev` address stays off). Checked from outside: a picture answers 200 with an edge `HIT` and a 304 to a conditional request; `/invoices/x.pdf`, `/`, an outbox path and a `/media/../invoices` attempt answer 403; all 27 image files the live home and shop pages use exist at the new host. `clients/demo/client.jsonc` has `PUBLIC_MEDIA_BASE_URL` set; the live store keeps using `/media` until the next `deploy:client demo`.
- **Browser cache on the media host (2026-10-24).** The responses had an `ETag` but no `Cache-Control`, so browsers revalidated each picture with a 304. A Cache Rule on the zone (`media.ecommerce.relion-app.com`, browser TTL one year, overriding the origin) now sends `Cache-Control: max-age=31536000`; the file stays a `HIT` at the edge. File names hold the asset id and the width, so a picture never changes under its name. The setting lives in the zone, not in the repo: a new client's media host needs the same rule (`docs/NEW_CLIENT.md`, step 3.8).
- **Prices by country in the guide, and the "changes we make for you" service (2026-10-24).** `docs-site` pages can now show text per region (Mexico, Ecuador, or the default of US dollars). Every region's version is in the HTML and CSS shows one, chosen on `<html data-region>` by a head script from the saved choice, then the visitor's time zone, then the default; a picker on the page changes it. The region list is `docs-site/src/data/regions.mjs`, the prices are only in `docs-site/src/data/change-plans.ts`. The service is sold in credits (small change 1, medium 2, large 5): pay per change, packs valid 12 months, and monthly or yearly plans (yearly = 10 monthly payments, credits pooled over the year, plus store check-ups). Ecuador pays the same dollar prices as the default region. The amounts are a proposal for the owner to adjust; they are final prices that already include VAT (IVA), and the service is invoiced. No new dependency.

## 2026-10-24 — Tracking tests with fakes (no GA4, Meta or Google account)

- **`npm run test:tracking` and a wider `test:consent`.** They check, on a local store, that nothing reaches Google or Meta before a choice or after a refusal, that an accepting visitor gives GA4 and the Pixel `page_view`, `view_item`, `add_to_cart`, `begin_checkout` and one `purchase`, and that the server sends exactly one GA4 purchase and one Meta purchase per consenting order (hashed e-mail and phone only) and nothing for the others. See `docs/TESTING.md`.
- **Fakes, as for WhatsApp.** `scripts/test/fake-ga4.mjs` answers 204 like Google's collector and lists what a real request would get wrong (measurement id, API secret, client id, purchase fields); `fake-graph.mjs` gained the Conversions API route (`POST /{pixelId}/events`). The store reaches them through `GA4_MP_BASE_URL` and `META_GRAPH_BASE_URL`; `store.mjs --tracking` sets those and made-up keys (`DEMO_TRACKING_VARS`, only in that mode, so the other tests see no change).
- **Nothing leaves the machine.** Chrome refuses the Google and Meta hosts (`Network.setBlockedURLs`), and `chrome.mjs` now passes protocol events through (`onEvent`) so each attempt is still recorded. The page's own queues (`dataLayer`, `fbq.queue`) show what the tools were given.
- **A second store beside the first.** `store.mjs` takes `DOCS_DIST` (build folder), `DOCS_PORT`, `DOCS_STATE` and `DOCS_INSPECTOR_PORT`, and `ownerCookie` (new `scripts/docs/owner-session.mjs`, moved out of `demo-data.mjs`) writes its session to a file of its own, so a run does not replace the build, the data or the admin session another run is using. Build with `npx astro build --outDir .wrangler/track-dist`, never over `dist/` while another store serves from it.
- **The test can fail.** It was run once against a copy of the code with the consent check and the GA4 job removed: 7 checks failed (no GA4 purchase, Meta got four purchases instead of two, the orders without consent were sent), and the unrelated ones (hashing, browser flows) still passed. The copy was a detached `git worktree`, removed afterwards.
- **What it verified that was open.** The script policy of the build allows `gtag.js` and the Pixel script (no violation while the app loads them) and still refuses an unlisted host; the banner is a named region. It does not show that Google or Meta accept the events: that needs a GA4 property and a Pixel (`docs/TESTING.md`).

## 2026-10-25 — The demo always shows the cookie banner

- **Why.** The banner appears in `auto` mode only when a Pixel, GA4 or the Conversions API is set, and the demo has none, so visitors never saw the consent choice the template offers. The demo is also the template's showcase, so it now runs `consentBannerMode: "always"`. Nothing is sent to Meta or Google: the banner only stores the `consent` cookie.
- **Where it lives.** In the demo snapshot, as a `marketing` row of `settings` (all defaults, banner `always`). The reset deletes the settings and restores the snapshot's, so a group missing from the snapshot goes back to its defaults (`auto`); that is why a live change in the admin would not last. `scripts/docs/home-content.mjs` has `applyDemoCookieBanner`, called by `demo-data.mjs`, so a snapshot made again with `npm run demo:snapshot` keeps it. The checked-in snapshot was edited to match, with its `version` recomputed the way `demo:snapshot` does (sha256 of accountId, tables and media), and it passes `demoSnapshotSchema`.
- **It reaches the live demo only when published.** `DOCS_STATE=.wrangler/demo-build npm run demo:publish` uploads the images and the snapshot to the demo bucket (needs `wrangler login`), and the next nightly reset, or an owner's reset on demand, restores it. Deploying the Worker alone does not change the live site. The snapshot published is whatever is in `clients/demo/snapshot/snapshot.json`, including any other content change it holds.

## 2026-10-25 — `demo:publish` emptied images; the banner moves to the real snapshot

- **What went wrong.** `demo:publish` read each image from the local store with `wrangler r2 object get` and uploaded the file with `put --remote`, ignoring whether the read worked. A failed read still leaves an empty file (checked: it exists with 0 bytes), so the script uploaded 0-byte objects over the keys of the images it could not read. The store it read from (`.wrangler/demo-build`) held none of the snapshot's 66 images, so every image was affected. It was stopped after 24 objects. Those 24 keys belonged to a snapshot made by a test (see below), absent from the bucket before, so none of the 39 images the live demo uses was touched (all 39 checked over HTTP: 200, not empty); nothing was lost, and the live demo kept working.
- **Fixed in the script.** `copyImages` reads and checks every image first (`assertImageRead`: the read must succeed and write something) and only then uploads, so a missing image stops the publish before the bucket changes. `--snapshot-only` publishes just the file after `assertImagesLive` confirms over HTTP that every image of the snapshot is in the live bucket and not empty. Both are checked with stand-ins, with no cloud call; run against the store that had no images, the real script stops at the first read and uploads nothing.
- **A test had written the committed snapshot.** `test:demo` took a snapshot into `clients/demo/snapshot/snapshot.json`, so the committed file briefly held test data (66 images, version `812635e0`); `82f50f8` restored the real one (`a41c8e83`, 39 images, the version published live). A second edit of mine started from the test data and was reverted with it; the banner row was applied again to the real file.
- **The banner row is in the snapshot again, and `demo:snapshot` now insists on it.** `scripts/demo/banner-rule.mjs` (`assertBannerAlways`) makes `demo:snapshot` stop when the marketing settings do not keep `consentBannerMode "always"`, only when it writes the committed file (a test sets `DEMO_SNAPSHOT_FILE` and snapshots a store with default settings, so it is exempt). The snapshot made after the first banner change had lost the row (the store it was taken from had `auto`), and the reset would have turned the banner off again without anyone noticing.
- **The repo snapshot is `9900c63a…`: the live one plus the `marketing` row, nothing else** (every other table and the 39 images identical, schema-valid). It reaches the live demo with `npm run demo:publish -- --snapshot-only` and the next reset.

## 2026-10-25 — Page cache serves a stale page and renews it behind the response

- **Why.** Measured on the live demo from Buenos Aires: a cache hit took about 40 ms, a miss 350 ms (shop) to 490 ms (product page). Each D1 round trip costs about 130 ms there, because the primary is in ENAM and D1 has no South American region (replicas exist only in ENAM, WNAM, WEUR, EEUR, APAC and OC). The visitors are mostly in Latin America, most of them in Mexico (which sits between the WNAM and ENAM regions, so a replica would save little per trip and not justify the Sessions API and bookmark work), so read replication was not done, and Smart Placement would move the whole Worker, cache hits included, to ENAM. On a quiet store the 5-minute page lifetime meant most visits were misses.
- **Behaviour (`src/http/page-cache.ts`).** A page is fresh for 5 minutes (`HIT`). The edge keeps it for 24 hours. When a visit finds it older than the fresh time, it gets the stored page at once (`x-page-cache: STALE`) and the page is rendered again with `waitUntil`; the next visit is a `HIT` with the new copy. A page with its own public policy (the sitemap, robots.txt) stays fresh for as long as it says, and is renewed the same way. The internal timing headers (`x-page-rendered-at`, `x-page-fresh-for`, `x-page-client-control`) are removed before a page is sent.
- **What still shows changes at once.** An admin save bumps the cache version, which is part of the key, so the next visit is a blocking `MISS` with fresh content and never the old page. A new deploy changes the build id in the key the same way.
- **What can be one request out of date.** After the fresh time, one visit per page per location sees the previous copy (prices, stock, a product that sold out). The cart quote prices and clamps the cart on the server, and checkout re-checks stock, so nothing is sold on a stale page's say-so.
- **No render storms.** At most one renewal per page per isolate every 30 seconds, which also paces retries after a failure. A renewal that throws, returns a non-200 page or sets a cookie is dropped (logged as `page_cache.renew_failed` when it throws) and the stored page keeps being served. If every renewal fails, that page is served stale for up to 24 hours; an admin save or a deploy clears it sooner.
- **Per location.** The Cache API is per data center, so the first visit in each location is still a `MISS`. Tiered or global caching would need purges from the admin (an API token) instead of the version key, which was not done.
- **Checked.** 23 checks with a fake edge cache and a controllable clock (fresh, stale, burst, throwing and uncacheable renewals, back-off, version change, the sitemap's own policy, 24-hour retention), and a run with the real runtime (workerd, the real Cache API and Astro middleware, a real 5-minute wait). The real run is the one that shows that Astro lets the page be rendered again after the response has been sent.

## 2026-10-25 — "What you get" page: page blocks and a phone with real screenshots

- **Two of twenty options combined.** From a 20-option proposal for `clients/what-you-get`, the owner picked option 1 (a guided page: a flow at the top, sections built from cards) and option 12 (a phone with notes on both sides). The page keeps every fact it had; lists became blocks, the five payment methods and the customer features became the phone showcase plus four cards, and "how to ask and how to pay" became a five-step flow.
- **Four small components, no new dependency.** `FlowSteps`, `FeatureGrid`, `PhoneShowcase` and `GuideIcon` (shared `BlockBody` and `BlockText`), with their shapes and icons in `docs-site/src/data/guide-blocks.ts` and their CSS in `guide-blocks.css`, using only `--guide-*` tokens (new ones in `guide.css`). Pages pass plain data as props; text that differs by country is `{ intl, mx, ec }` and renders through `RegionText`, so the country picker keeps working inside the blocks.
- **The phone shows the real demo store.** `PhoneShowcase` reads the existing `assets/screens/<lang>/shop-*-phone.png` captures, so the screenshots script keeps them current. Without JavaScript every screen is shown one after another; the script only hides the others.
- **The step-card rule is why `FlowSteps` is a div.** The guide turns every top-level `<ol>` into numbered cards, so the flow's list lives inside a wrapper. The blocks sit in `.not-content` so Starlight's text styles stay out. The sticky reading path of option 1 is not rebuilt: Starlight's "On this page" column already is one.
- **One pill button.** The region picker's button class became `guide-pill-button` and the phone's screen buttons use it too.
- **Measured on the live demo (2026-10-25, from Buenos Aires, 4 pages of each kind, unique cache keys).** First visit (`MISS`): home 506 ms, shop 342 ms, product 499 ms (medians). Repeat (`HIT`): 25, 33 and 29 ms. Five minutes later (`STALE`, renewal in the background): 37, 33 and 33 ms. A few seconds after that, `HIT` again: 33, 28 and 24 ms. So a visitor on a quiet store no longer waits for the database when the fresh time ends. One stale answer took 324 ms (the first request after the pause; the other 11 took 29 to 38 ms), most likely a new connection or a cold Worker, not a render. These numbers come from Argentina, 130 ms per D1 trip; a Mexican visitor's misses should be shorter, which was not measured.
- **The `clients` suite passes (15/15).** It was run from a throw-away copy of the repository, because its dry run of `deploy:all` writes the root `wrangler.jsonc` and a temporary `clients/zz-test-client` folder, which would collide with another session working in the shared tree. Its paths come from the script's own location, so a copy is fully isolated.

## 2026-10-25 — The guide moves from docs.relion-app.com to docs.e-baq.com

- **Why.** The guide belongs on the brand's own domain. `e-baq.com` is in another Cloudflare account (`ebaq.solutions@gmail.com`) than `relion-app.com`, and a Worker custom domain only attaches inside the zone's own account, so the Worker `ecommerce-guide` is now deployed from that account (`wrangler login` with it, then `npm run deploy` in `docs-site/`).
- **What changed.** `docs-site/wrangler.jsonc` routes `docs.e-baq.com` and `astro.config.mjs` uses it as `site`. The old custom domain was removed from the old account's Worker; that Worker (`ecommerce-guide`) was then deleted from the old account.
- **Open step.** `DEMO_GUIDE_URL` in `clients/demo/client.jsonc` points to the new address, but the live demo store keeps the old link until it is redeployed, so its "guide" link is dead until then. `worker-configuration.d.ts` is generated and follows on the next `cf-typegen`.

## 2026-10-25 — GitHub Actions deploys the demo store

- **Workflow.** `.github/workflows/deploy-demo.yml` runs on a push to `main` (not for `docs/`, `docs-site/` or Markdown only changes) and on demand. It runs `npm ci`, generates the Worker config, `npm run check`, then `npm run deploy:client -- demo`, the same command as a manual deploy, so the build, queue creation, remote migrations and the lock behave the same.
- **Secrets.** The repository needs two Actions secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (the account of `relion-app.com`). The demo has no `accountId` in `client.jsonc`, so `cloudflareEnv` passes them through. The Worker's own secrets (Turnstile, PayPal, dLocal Go) stay in Cloudflare and are not touched by a deploy.
- **One deploy at a time.** `concurrency` queues a newer push instead of cancelling a deploy that may be between migrations and the Worker.
- **Not covered.** The guide (`docs-site/`) keeps its own manual deploy, because it lives in another Cloudflare account. Other clients are not deployed from CI.

## 2026-10-25 — Environment variables: one list for the types, no dead names

- **Types come from `.dev.vars.example`.** `cf-typegen` now runs `wrangler types --env-file .dev.vars.example`. Before, `worker-configuration.d.ts` listed whatever the developer's own `.dev.vars` held (it had `ADMIN_EMAIL`, `ADMIN_PASSWORD` and no `GA4_API_SECRET`), so it changed on every machine. A new secret goes in the example file; secrets are read with `readSecret`, so a missing type never breaks a build.
- **The example is complete.** It gained `GA4_API_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `META_GRAPH_VERSION`, `META_GRAPH_BASE_URL` and the two `PAYPAL_SANDBOX_BUYER_*` names (documented for manual tests; no code reads them).
- **Removed.** `JOBS_MODE` (set in `wrangler.base.jsonc`, read nowhere; the inline mode was never built, see Stage 5), `DLOCALGO_SMART_FIELDS_KEY` (no reader; dropped from `docs/TESTING_INTEGRATIONS.md`), and `ADMIN_EMAIL` / `ADMIN_PASSWORD` (local leftovers).
- **The 12 stage suites against the build that has stale-while-revalidate (2026-10-25).** Run from a private copy of the demo state, with its own session and server log, so the shared cookie and data were untouched. Passing in full: access 28, consent 22, keyboard 25, crawl (474 URLs, 0 errors), filters 1,647, admin-filters 131, admin-actions 168, flows 43, orders 113 (a first attempt died on a flaky `wrangler d1 execute` call; the rerun passed), reports 32. Not clean: smoke (178 of 179: the customer invoice PDF download answered 500) and whatsapp (48 of 52: the four checks about the invoice message with its PDF). Both come from the same cause in this environment, not from the code: the local server could not start with its remote-only bindings (Browser Rendering, Analytics SQL, AI) because `wrangler`'s login was not valid for this account, so the private copy of the config had them switched off and no invoice PDF could be rendered. Earlier the same day, with the bindings working, smoke passed 179 and whatsapp 52 on a build that already had the invoice-attachment change. To close it, log in again with `npx wrangler login` and rerun `smoke` and `whatsapp`.

## 2026-10-26 — The guide gains a "Why it pays off" section, with Mexican figures and their sources

- **Why.** The guide explained what the store does and what it costs, but never why a business should want one. Three pages now answer that for the market the stores actually sell in: `benefits/own-website` (why an address of your own beats a social profile), `benefits/selling-online` (why a store, and what a marketplace keeps on every sale) and `benefits/mexico-data` (every figure with its source, its date and what it measures). Both languages.
- **It is a fifth stage, not a new sidebar group.** `docs-site/src/data/guide-stages.ts` gained `por-que` as the first stage, so the home page and the sidebar both show it from the one list, as before. The thumbnails reuse existing screenshots (`shop-home-desktop`, `shop-product-desktop`, `admin-reports`); no new capture is needed. `start/what-is-this` points at it from its "who should read what" table.
- **No new component or CSS.** The pages use `FlowSteps`, `FeatureGrid` and Markdown tables, so nothing was added to
  `guide-blocks.css`.
- **Every table is two columns, like the rest of the guide.** A 360 px screen cannot hold more: the first column alone has a
  `--guide-col-min` of 11rem and `.sl-markdown-content table` clips instead of scrolling. So the "social media only vs. your
  own site" comparison and the three-way marketplace cost comparison are `FeatureGrid` cards (one per topic, one per
  platform), and on the data page the source moved into the second cell in italics.
- **Only figures that could be traced to a primary source (checked 2026-10-26).** Official statistics: INEGI ENDUTIH 2025 (press release 32/26, 16 June 2026: 86.1 % of people used the internet, 104.9 million; 84.6 % a mobile phone against 38.1 % a computer; 78.3 % of households online), INEGI Censos Económicos 2024 (4.4 % of micro-businesses sold online in 2023 against 27.9 % of small and 33.4 % of medium firms) and INEGI's EMEC (internet, catalog and TV-only sellers grew revenue 17.6 % in August 2026). Industry studies: AMVO's Estudio de Venta Online 2026 (941 billion pesos, +19.2 %, 17.7 % of retail, 77.2 million shoppers, the abandonment and delivery figures) and AMVO's Pulso El Buen Fin 2026 (survey of 1–8 September 2026). Panel: Digital 2026 by We Are Social and Meltwater (99 million social identities, WhatsApp at 91.4 % of internet users). Published rates: Mercado Libre México (8 %–16 % Clásica, 12.5 %–20.5 % Premium, plus $25/$30/$37 per unit under $299), Amazon México (referral fee from 8 %, most categories 10 %–15 %) and PayPal México (3.95 % + a fixed fee domestically). dLocal Go publishes no rates, and the page says so instead of guessing.
- **What was deliberately left out.** The numbers that circulate in vendor blogs with no study behind them ("64 % of Mexican SME e-commerce sales go through WhatsApp", "40 % of SMEs have no digital presence", a 2020 Google/Deloitte speed-to-conversion figure presented as current). `benefits/mexico-data` says why, and ranks its four kinds of source, so a reader can tell an official census from an association's estimate.
- **The AMVO caveat is in the guide, not hidden.** AMVO's full report is behind a form, so some of its figures reach the page through the press that covered it, and AMVO is an association of companies that sell online. Both facts are stated on the sources page.
- **Checked.** `npm run build` in `docs-site/`: 60 pages, no errors; the three new pages exist in both languages, the home page renders the new stage in Spanish and English, and every internal link added points at a page that was built.

## 2026-10-28 — "Why it pays off" is redesigned as a dark pitch, from a 20-option proposal

- **What the owner picked.** From 20 redesign options shown as artboards on a design canvas, the owner chose 5 (demand against supply, side by side), 7 (a cover of its own for the section), 9 (three numbered acts at full width), 10 (the same day told with and without), 14 (a dark "pitch" look for the whole section) and 17 (the figures count up when they come into view). The other 14 options were not built.
- **The dark look is one selector, not a Starlight override.** `docs-site/src/styles/guide-benefits.css` feeds Starlight's own tokens under `:root:has(.benefits-pitch)`, and every block of the section carries that class, so the sidebar, the prose, the asides and the tables follow with no component swap and no per-page frontmatter. The palette is fixed (`--guide-pitch-*` in `guide.css`): the section is dark in the light theme too, which is the point. `--sl-color-bg-inline-code` had to be fed as well, or inline code kept the light theme's background (grey on near-white, 1.6:1).
- **Four components, all data-in.** `SectionCover`, `SplitContrast`, `ActBands`, `BeforeAfter` and the shared `StatStrip` take plain props the way `FeatureGrid` does, so the copy stays in each language's page. Act numbers come from the array order, so a page cannot renumber itself.
- **The counting is progressive enhancement.** `src/scripts/count-up.js` runs on `[data-count]`, which the pages ship with the final number already in the text, so no JavaScript, an old browser or `prefers-reduced-motion` all leave the real figure on screen. It keeps the separators the author wrote (`86.1 %`, not `86,1 %` from `Intl`), and holds the element's measured width so nothing jumps while it counts. The three components import the one module, which Vite emits as a single 1.2 KB chunk.
- **The cover hides Starlight's page title.** `template: splash` still prints the title as an `h1`, and the cover writes its own, so the first content panel is hidden on pages with `.benefits-cover`. One `h1` per page.
- **A new page.** `benefits/index` is the section's cover in both languages, added to the `por-que` stage in `guide-stages.ts`, so it reaches the sidebar and the home page from the same list as the rest.
- **Checked.** `npm run build`: 62 pages, no errors. Looked at in a browser at 1280 px and at phone width: the cover, the acts, the split and the before/after stack to one column with no horizontal scroll, the counted figures end on the written value, and the count-up code ships once.

## 2026-10-28 — Feature cards: the icon goes on top in three columns, and the chip takes the loud amber

- **Why.** In the three-column grid the icon sat beside the text, and the icon plus its gap cost about 4rem of a 17rem card. That left the text in a 160px ribbon that broke every three words, which is what made the cards look unplanned rather than any colour choice.
- **The column count decides it, not the card width.** `.guide-features:not(.is-wide) .guide-feature.is-row` stacks the icon. A container query was tried first and could not work: an element never matches a container query on its own container, and `.guide-feature` is both the container and the flex parent. Moving the container to a wrapper would have meant more markup for the same result.
- **The loud chip now belongs to feature grids.** `guide-blocks.css` said `is-accent` was simply the louder of one amber family; a feature grid is the one place where six chips appear at once, so there the chip is filled amber with the glyph in ink, which reads in both themes like the active pill and the act numerals. The tinted chip keeps the rest (flows, single blocks) and gained a `--guide-icon-ring` border, because tint and card were close enough in lightness that the chip dissolved into the card on white.
- **Also.** `--guide-icon-lg` 2.5 → 2.75rem, `--guide-icon-sm` 1.35 → 1.5rem, card padding `xl` → `2xl`, and the block title moved to `--guide-text-base` with tight tracking.
- **Alt text.** 26 screenshot alt texts across 12 pages repeated the heading directly above them, so anyone copying a page or hearing it read got the phrase twice. They now describe the screen. `es/admin-notification-log.png` and `es/admin-reports.png` are still broken captures (Chrome's "site can't be reached" page: the capture script ran without the store's dev server up) and need `npm run docs:screens` with the store running.
- **Checked.** `npm run build`: 64 pages. Looked at `/benefits/own-website/` at 1280 px in both colour schemes.

## 2026-10-28 — The demo deploy could never run on a clean checkout

- **What happened.** `gh workflow run deploy-demo.yml` failed at the Deploy step with `ENOENT … .wrangler/deploy.lock`. `takeLock()` opens that path with the exclusive `wx` flag, which throws ENOENT when the **parent directory** is missing, and `.wrangler/` is gitignored, so a fresh runner (or a new clone) has never had it. Locally the folder is left over from earlier wrangler runs, which is why this only showed up in CI.
- **Fix.** `takeLock()` creates `.wrangler/` with `mkdirSync(…, { recursive: true })` before the exclusive open. The lock itself is unchanged: `wx` is still what makes two deploys mutually exclusive.
- **Why it had not been seen.** The workflow skips pushes that only touch `docs/`, `docs-site/` or Markdown, and those are the only pushes since it was added, so it had not actually run end to end.

## 2026-10-28 — The guide's meaning colour leaves the amber family for a deep teal

- **Why.** `--guide-accent-contrast` was the brand amber darkened until it passed on white (`#7a5200`). Any amber dark enough to read as text is brown, and brown is what it looked like: the price cards, the bullets and the links all read as mud rather than as the brand.
- **The token changes, nothing else does.** `--guide-accent-contrast: #0f6558`, a deep teal at 6.9:1 on white, so links, bullets, callout titles, the `:::note` accent, prices and `--guide-border-hover` all move with it. `--guide-accent` stays `#ffc107`: amber is still the loud fill (region pills, feature chips, act numerals, focus rings), and teal is amber's complement, so the two sit beside each other instead of muddying each other.
- **The light ramp follows the hue.** `--sl-color-purple-low` `#fff6dd` → `#e3f1ed` and `--sl-color-purple-high` `#5c3d00` → `#0a4238`, since Starlight's purple is fed from this token. The dark theme is untouched: on graphite the amber is already the readable one, so `--guide-accent-contrast` still falls back to it there.
- **The tinted icon chip was the one risk** (a teal glyph on an amber tint) and it never happens in practice: every chip the guide renders today comes from a feature grid, which is the filled amber variant.
- **Checked.** `npm run build` in `docs-site`: 64 pages, no errors. Looked at `/clients/what-you-get/` (the three price cards, in the Mexican region), `/benefits/own-website/`, `/clients/changes-service/` and `/admin/invoices/` at phone width in both colour schemes.

## 2026-10-28 — Three demo stores, one per vertical, and demo mode stops being for one slug

- **Why three.** One demo has to be a shop of some kind, and whatever it sells is wrong for everyone else looking at it. A clothing boutique, a skincare brand and a packaged-food store are three different arguments for the same software, and the prospect only has to recognise one. The storefront redesign ships as those three rather than as one restyled demo.
- **The verticals.** `demo-ropa` (Casa Mina, Guadalajara), `demo-skincare` (Raíz) and `demo-despensa` (Comal: coffee, salsas and preserves). Packaged food, not cooked food: shipping only has `flat` and `pickup` (`src/domain/ordering/shipping.ts`), with no delivery zones, schedules or minimum order, so a local-kitchen demo would show a store this software cannot run. Local delivery is a product decision, not a design one.
- **Resources.** `npm run client:new` for each, in the account that already holds `demo` and the `relion-app.com` zone (bianjieandara@gmail.com, `ec9019b9…`). Each got its D1, KV, two queues and R2 bucket; rate-limit bases 1010, 1020 and 1030. The crons are staggered (`5,20,35,50`, `10,25,40,55`, `3,18,33,48`) so four nightly resets never land in the same minute.
- **Demo mode was tied to one slug.** `assertDemoConfig` refused `DEMO_MODE: "on"` unless the slug was exactly `demo`, which would have blocked the deploy of all three. It now accepts `DEMO_SLUG_PATTERN` (`demo`, or `demo-` and a vertical). The guard keeps its point: a real client's slug cannot match, so no store of ours can turn on the shared login by accident. The rest of the guard (sandbox payments, outbox e-mail, a login that is set) is unchanged.
- **Still tied to one slug:** `scripts/demo/publish.mjs` has `const CLIENT = 'demo'` and `scripts/demo/snapshot.mjs` writes to `clients/demo/snapshot/` unless `DEMO_SNAPSHOT_FILE` says otherwise. Both need a slug argument before any of the three can be filled with content; neither blocks a deploy.
- **Not done here.** No deploy: there is nothing to deploy yet but the current design. Media custom domains (`media.<host>`), their WAF rule and cache rule are dashboard steps, so `PUBLIC_MEDIA_BASE_URL` is empty and pictures come from the Worker until then.

## 2026-10-28 — The buyer is told who sells, where the doubt happens

- **Why.** The Ecuadorian research says one in three online buyers abandons the order fearing a scam, and the store's identity lived only in the footer and the legal pages. The product page and the checkout are where the buyer decides to trust a store they have never heard of, so `SellerTrust.astro` is shown there: legal name and tax ID, address, phone, Google rating and the payment methods.
- **Nothing new is stored.** `invoicing.legalName`, `taxId` and `taxIdType` already existed for invoices, `contact.address` and `contact.phone` are already public, and the Google rating is the snapshot the reviews job keeps in KV. The card publishes what the store already filled in; empty fields are left out.
- **One switch: `invoicing.showSellerIdentity`, on by default.** A sole trader's tax ID is their national ID in several countries, so a store can keep it off the storefront without losing it on its invoices. It hides the name and the number only; the address and the phone are contact details the store already publishes.
- **The methods come from `availablePaymentMethods`,** not from `checkout.enabledMethods`, so the card can never promise a method the checkout will not offer (an unconfigured gateway, or one that cannot charge the store currency). Their names moved to `paymentMethodLabel` in `src/ui/lib/`, which the checkout form's labels now use too: they were spelled out twice.
- **The checkout hides the method row** (`showMethods={false}`): the buyer is choosing one in the radio list right above it.
- **Cost on the cached product page:** two more settings groups (invoicing, checkout) parsed from the snapshot the request already read, and one KV read, only when the store has Google reviews turned on. `loadSellerTrust` hands the invoicing group back so the checkout does not read it twice.
- **Checked.** `npm run check` and `npm run build`; the demo store at 360 px in Spanish and English, on the product page and the checkout.

## 2026-10-28 — The hero and the product blocks gained layouts, so a store can stop looking like the template

- **Why.** Every store built from this template arrived at the same page: a rounded card floating on grey, a tinted tile per product with the price in a black pill on the photograph, and section after section in the same rhythm. That is what reads as "a theme" rather than as a shop. The fix is not one new design; it is making the arrangement a choice the owner makes in the page builder.
- **One closed set, in the domain.** `src/domain/content/section-layouts.ts` holds `HERO_LAYOUTS` (`contained`, `bleed`, `scene`, `editorial`) and `PRODUCT_LAYOUTS` (`carousel`, `grid`, `gallery`, `flush`, `list`), each with a `…Of()` narrowing function so a page saved with an older value falls back instead of rendering nothing. The page builder's options, its zod validation and the renderers all derive from those two lists, and `layoutOptions()` in `core-widgets.ts` takes a full label record, so a layout added without a Spanish and English name fails to compile.
- **The tile is where most of it lives.** `ProductCard` took a `variant`: `card` is what the storefront has today (tint, badges, price tag on the picture), and `plain`, `flush` and `list` drop the tint and the tag and move the price into the caption. The shop grid and the default home block still pass nothing, so they are unchanged.
- **`scene` writes nothing on the photograph.** The other picture layouts put white type over a dark gradient, which needs a shot with a quiet corner. `scene` puts the type in a solid block resting on the picture instead, so a store with ordinary photographs can still use a big hero.
- **Full bleed without a horizontal scrollbar.** `@utility full-bleed` is `width: 100vw; margin-inline: calc(50% - 50vw)`, and `100vw` counts the scrollbar, so the band overhangs by a few pixels on a desktop. `<main>` got `overflow-x: clip`, not `hidden`: `clip` trims the overhang without making `<main>` a scroll container, so `position: sticky` inside it (the catalog filters) keeps working against the window.
- **Checked.** `npm run check` and `npm run build` pass. A throwaway local page rendered all seven arrangements at once: the classes land per layout (gallery's narrow column, flush's `full-bleed` and `gap-px`, the list row, the three hero geometries) and Tailwind emits `full-bleed`, `overflow-x-clip`, `aspect-4/5` and `aspect-16/9` into the bundle. Not looked at in a browser: the Chrome profile on this machine was held by another process, so the visual pass is still owed.

## 2026-10-29 — The demo deploy works from Actions again

- **What was broken, in order.** `takeLock()` opened `.wrangler/deploy.lock` with the exclusive `wx` flag, which throws ENOENT when the parent directory is missing, and `.wrangler/` is gitignored, so no clean runner ever had it. Then `CLOUDFLARE_ACCOUNT_ID` pointed somewhere that could not be routed (`7003`). Then the credential itself was rejected on format, both as a bearer token (`6111`) and, once passed as a Global API Key, as `X-Auth-Key` (`6103`).
- **Why the credential needed a diagnostic step.** A secret's value cannot be read back, so each guess at cleaning it up cost a deploy. `Describe the credential` prints its length and the bytes in it that are not letters or digits, never the value: it reported 21 characters, which is neither an API token nor a Global API Key, and ended the guessing.
- **The deploy step picks the variable from the value's shape.** 37 hex characters is a Global API Key and travels in `CLOUDFLARE_API_KEY` beside `CLOUDFLARE_EMAIL`; anything else is an API token in `CLOUDFLARE_API_TOKEN`. Whitespace is trimmed first, because a newline picked up while pasting breaks either header and Cloudflare answers the same way it does for a credential that is simply wrong.
- **A token pasted as a secret's name is destroyed.** One attempt created a secret _named_ after the token. GitHub upper-cases secret names, so the value lost its lower-case letters and Cloudflare rejected it; it was deleted. The token it came from should be rotated, since its upper-cased form was listed in the repository's secrets.
- **Current Cloudflare API tokens are 53 characters** with a `CFUT_` prefix, not the 40 of the older ones. The hint in the diagnostic step says both.
- **Account.** The demo lives in `ec9019b98b852dc29c0d43042d3ad8bf`; it is the account whose `demo-jobs` queues have a producer and a consumer. The other account has queues of the same name with none.
- **Checked.** Run 40801761012: build, queues, remote D1 migrations and deploy, `deployed "demo"`, and the store answers 200 with its guide link pointing at docs.e-baq.com.

## 2026-10-28 — Categories can stop being three more cards

- **Why.** With the hero and the product blocks able to change shape, the category block was the last section that always looked the same: three rounded photo tiles with a rotating arrow in the corner, which is the most recognisable flourish of a bought theme.
- **`CATEGORY_LAYOUTS`**: `tiles` (what every store has today, unchanged and still the default), `flush` (the same pictures with square corners, a hairline apart, reaching both edges of the window) and `links` (no pictures at all: the categories read as a row of type under a rule). The arrow is drawn only by `tiles`.
- **`links` is the one that earns its place.** A store whose photographs are its argument — a look book, a gallery — should not spend its first screen on three more pictures of nothing in particular. A line of category names costs one row and sends people into the catalog just as well.
- **Checked.** `npm run check` and `npm run build` pass. The local preview page renders all three: the flush band carries `full-bleed` and `gap-px`, the links row carries no `<img>`, and the nine arrows in the HTML all belong to the tiles section (nine active categories in the local seed).

## 2026-10-28 — The benefits row and the quotes can drop their costume too

- **Why.** The icon row ("Envíos · Cambios · Pago seguro · WhatsApp", four coloured glyphs between hairlines) is the single most recognisable element of a bought ecommerce theme, and three grey cards with five outline stars is the second. Both say "a template filled this in" rather than anything about the store.
- **`BADGE_LAYOUTS`**: `icons` (today's divided row, unchanged and still the default) and `line` — one quiet line of text, the benefits parted by middots, no icons at all. A store whose benefits are facts ("Guadalajara, desde 2019", "Pago en OXXO o transferencia") is better served by a line of type than by a shipping truck.
- **`TESTIMONIAL_LAYOUTS`**: `cards` (unchanged default) and `quiet` — no card, no background, no stars; the quote set in the display face above its author, parted by a rule.
- **`quiet` gives up the rating, on purpose.** The stars are what make a quote read as a widget; without them the words have to carry it, which is the point. A store that wants the rating on the home page keeps `cards`. Nothing is lost elsewhere: the ratings still reach search engines through the product structured data, and the seller card on the product page carries the Google rating.
- **Checked.** `npm run check` and `npm run build` pass. The local preview page renders all four: one icon row and one text line, then three carded quotes with their star groups and three quiet ones with none, each with the blockquote class its layout asks for.

## 2026-10-28 — The promotion and the WhatsApp block finish the set

- **Why.** With everything else able to change shape, these two were the last sections that always arrived the same: a dark rounded card with a button, and a grey rounded band with a black pill. On a page where nothing else is a card any more, they were the two that still looked bought.
- **`PROMO_LAYOUTS`**: `card` (unchanged default), `bleed` (the same band with square corners, reaching both edges) and `plain` — no picture and no fill, the offer set as type between two rules. `plain` ignores the chosen picture rather than hiding the chooser, so turning the layout back restores the banner as it was.
- **`CTA_LAYOUTS`**: `card` (unchanged default) and `line` — a rule, the question on the left and a text link on the right. A store that answers on WhatsApp all day does not need to sell the idea with a pill.
- **Every home section now carries a Layout choice**: hero, products, categories, benefits, quotes, promotion and WhatsApp. Every default is what the storefront already drew, so no deployed store changes by itself.
- **Checked.** `npm run check` and `npm run build` pass; the local preview page renders all five new arrangements with the frame each layout asks for.

## 2026-10-28 — The demo scripts take a slug, so there can be more than one demo

- **What was tied.** `scripts/demo/publish.mjs` had `const CLIENT = 'demo'` and `scripts/demo/snapshot.mjs` wrote to `clients/demo/snapshot/` unless `DEMO_SNAPSHOT_FILE` said otherwise. With three per-vertical demos provisioned, neither could reach them.
- **One parser, in the shared lib.** `demoSlugFromArgv(argv)` takes the first argument that is not a flag, falls back to `demo` so every existing command still means what it meant, and refuses anything `DEMO_SLUG_PATTERN` does not accept: these scripts write a shared public login and restore the whole store every night, so pointing them at a real client would be a disaster, not a mistake.
- **`npm run demo:snapshot -- demo-ropa`** writes `clients/demo-ropa/snapshot/snapshot.json`; **`npm run demo:publish -- demo-ropa`** publishes it to that client's own bucket. `publish()` takes `slug` in its options and `assertImagesLive` takes one for its message.
- **The R2 key stays `demo/snapshot.json`.** It is a path inside each client's own bucket, and the Worker reads it from `DEMO_SNAPSHOT_KEY`; each demo has its own bucket, so three stores never collide on it. Renaming it would have meant a Worker change for nothing.
- **Each demo still needs its own local build.** The snapshot is taken from whatever store `DOCS_STATE` points at, so filling three demos means three builds, three `docs:data` runs and three snapshots. Nothing in the scripts assumes otherwise now, but nothing automates it either.
- **Checked.** eslint and prettier on the three changed files; the parser was exercised on six argument shapes (no args, flags only, a vertical slug, a slug with a flag, a real client, a malformed slug) and `publish.mjs demo-ropa --dry-run` stops at `clients\demo-ropa\snapshot\snapshot.json`, which is the path the slug is supposed to produce. A full `npm run check` was red at the time on six errors in another session's in-flight payment-method work, none of them in these files.

## 2026-10-28 — Deuna! enters as a method paid by hand, not as an API adapter

- **Why Deuna! at all.** It is the wallet Ecuadorian buyers already have, and it charges the store about 2% against the roughly 5,75% effective of a card button. A store that only takes cards is unusable for the buyer the Ecuadorian research describes.
- **Why by hand.** Deuna!'s merchant API is not public: the credentials come from an assigned account manager and the endpoints and field names are not published, so the HTTP contract cannot be written without them. Inventing endpoints would have produced an adapter that type-checks and cannot charge. `DeunaGateway` therefore returns `{ kind: 'confirmation' }` like the bank transfer: the buyer sends the money from the app to the number or alias in the instructions, and the store confirms the order from the admin. The automatic version is a later migration of this same method, not a different one.
- **The method is offered only when it is set up.** `isConfigured` asks for `checkout.deunaInstructions`, and `supportsCurrency` accepts USD only: Deuna! settles in Ecuador. A store elsewhere never sees it.
- **The instructions stopped being "the bank's".** `bank_transfer` and `deuna` are now `INSTRUCTED_METHODS`, and `paymentInstructions(checkout, method)` is the one place that maps a method to the text the buyer is shown; the order page and the order e-mail both read it. The notification context keeps the key `bankInstructions`, because stored e-mail templates write `{{block:bankInstructions}}` and renaming it would blank that block on every store that has one saved.
- **Migration 0006 rebuilds `orders`,** as 0003 did, because SQLite cannot change a CHECK constraint in place. It carries the two GA columns added by 0005 and recreates the three dependent tables and the five indexes.
- **Checked.** `npm run check` and `npm run build`. The six migrations were applied in order to a scratch SQLite database with an order, an item, an event and an invoice in it: all four rows survive, `ga_client_id` is kept, `PRAGMA foreign_key_check` is empty, the five indexes are back, the cascade still deletes items and events, `'deuna'` is accepted and an unknown method is still refused. Not checked against a store with Deuna! turned on: no store has the details filled in yet.
