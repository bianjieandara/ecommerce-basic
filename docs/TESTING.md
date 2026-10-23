# Testing guide

This is a template, so "tested" has two meanings: what the template proves for every client, and what each client proves with
their own accounts before launch. This page is the map. The step-by-step procedures per provider (payments, email, WhatsApp,
Meta tracking, reports, platform pieces) are in [TESTING_INTEGRATIONS.md](./TESTING_INTEGRATIONS.md).

Nothing here needs a live site. Levels 0 to 2 run on your machine with no accounts at all.

## The five levels

| Level | What it proves                                                | Needs                                 | How                                                  |
| ----- | ------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| 0     | Types, lint, formatting, the build                            | Nothing                               | `npm run check` and `npm run build`                  |
| 1     | The store works end to end: pages, admin, API, checkout paths | The local demo store                  | `npm run test:smoke`                                 |
| 2     | Webhook signature checks and status updates behave            | The local demo store                  | `npm run test:webhooks`, the cron URL, console email |
| 3     | The real providers accept what the store sends                | Provider sandbox or test accounts     | [TESTING_INTEGRATIONS.md](./TESTING_INTEGRATIONS.md) |
| 4     | The client's own domain, DNS, email and payments are ready    | The client's real accounts and domain | The pre-launch checklist below                       |

Levels 0 to 2 are done once per release of the template. Levels 3 and 4 are done once per client, because they depend on that
client's accounts. A template release never has to wait for level 3 or 4.

## Quick start (levels 0 to 2)

```bash
npm run check                 # types, ESLint, Prettier
npm run build                 # production build into dist/
npm run docs:store            # the demo store on http://localhost:4400 (leave it running)
npm run docs:data             # in another terminal: products, pictures, home page, orders, messages
npm run test:smoke            # about 2 minutes, 180+ checks
npm run test:webhooks -- whatsapp-verify
npm run test:access           # anonymous access to every admin route; an editor against owner-only screens
npm run test:consent          # the Pixel stays off until the visitor accepts (needs Chrome)
```

`docs:store` serves the production build with its own database in `.wrangler/docs-state`, so it never touches development data.
Re-run `npm run build` and restart it after code changes. Stop it with Ctrl+C; if a port stays busy, stop the leftover `workerd`
processes whose command line mentions `docs-state`.

## What the local kit covers

**`npm run test:smoke`** ([scripts/test/smoke.mjs](../scripts/test/smoke.mjs)) checks, on the demo store only:

- every public page in Spanish and English, 404s for unknown pages, `sitemap.xml`, `robots.txt`, the product feed, `/api/health`;
- security headers, and that a cross-site `text/plain` or form POST is refused and no CORS permission is granted;
- every admin page with a session, and that every one of them refuses an anonymous visitor;
- every email template page and its preview;
- the checkout for all five payment methods (bank transfer, cash on delivery, WhatsApp, dLocal Go, PayPal), the private order
  link (with and without its key), the contact form, cart validation;
- the three webhook endpoints refuse an unsigned call;
- an order marked paid produces an invoice, and its PDF downloads only with the right key;
- the sales report matches a direct count in the database, the CSV opens in Excel (UTF-8 BOM), and every product in the feed has
  the fields Meta and Google require, in the right shape.

The form rate limit (10 requests a minute) is part of what it exercises, so the run includes a one-minute pause.

**`npm run test:access`** ([scripts/test/access.mjs](../scripts/test/access.mjs)) calls every admin API route without a session (each
must refuse), then, with temporary users, checks that an editor reaches the day-to-day screens but gets 403 on the owner-only ones and
actions, and that a deactivated user, an expired session and a made-up token are refused. It removes its users afterwards.

**`npm run test:consent`** ([scripts/test/consent.mjs](../scripts/test/consent.mjs)) drives Chrome through the consent banner with a
made-up Pixel id: nothing reaches Meta before a choice, "Only necessary" keeps the Pixel off, "Accept" loads it, and the choice
persists. It restores the marketing settings afterwards.

**`npm run test:webhooks`** ([scripts/test/webhooks.mjs](../scripts/test/webhooks.mjs)) sends correctly signed and wrongly signed
webhook calls to the demo store:

| Command                                        | Expected                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `dlocalgo DP-0000`                             | Signature accepted, then 502 because dLocal Go does not know that payment id (so it would retry) |
| `dlocalgo DP-0000 --bad`                       | 400 `INVALID_SIGNATURE`                                                                          |
| `whatsapp-verify`                              | 200 with the challenge as plain text                                                             |
| `whatsapp-verify --bad`                        | 403                                                                                              |
| `whatsapp-status <id> delivered\|read\|failed` | 200, and the log row moves forward (a later "failed" after "read" changes nothing)               |
| `whatsapp-status <id> read --bad`              | 403                                                                                              |
| `paypal`                                       | Explains why PayPal cannot be faked locally                                                      |

The demo store starts with fixed, made-up WhatsApp webhook secrets (`DEMO_WEBHOOK_VARS` in
[scripts/docs/shared.mjs](../scripts/docs/shared.mjs)), so no Meta account and no change to `.dev.vars` is needed. The dLocal Go
case signs with the sandbox keys in `.dev.vars` and prints nothing secret. Both scripts refuse any address that is not on this
machine.

**Other local tools**

- `astro dev` has `/dev/emails/<key>?locale=en` (an email with sample data) and `/dev/notify?key=...` (queues a sample message;
  the console transport prints it). They answer 404 in a production build, so on the demo store use the admin's preview and
  "send test" instead.
- With `EMAIL_TRANSPORT=console` in `.dev.vars`, emails are printed to the terminal and not sent.
- Scheduled jobs do not run by themselves locally. Trigger one tick with
  `curl "http://localhost:4400/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"` (answers `ok`; observed on this project). Cloudflare's
  docs name the path `/cdn-cgi/local/scheduled`, which also works here. Ticks are idempotent: a second call in the same period
  enqueues nothing new.
- Turnstile has test keys that always pass; the demo scripts use the dummy token `XXXX.DUMMY.TOKEN.XXXX`.
- Inspect the local database with `npx wrangler d1 execute DB --local --persist-to .wrangler/docs-state --command "SELECT ..."`.

## What is verified where

| Area                            | Template release (levels 0 to 2)                                 | Each client (levels 3 and 4)                                  |
| ------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Storefront, cart, admin         | Smoke test, Lighthouse on key pages                              | Look and feel on the client's devices                         |
| Card payments (dLocal Go)       | Signature check, error path, idempotent confirmation             | A sandbox payment per card outcome, then one live payment     |
| PayPal                          | Webhook refusal of unsigned calls                                | A sandbox buyer approval, a capture, a refund                 |
| Email                           | Templates render in both languages, console transport            | Domain onboarding, a test send, spam-folder check             |
| WhatsApp                        | Verification handshake, signature, forward-only status updates   | Meta accounts, template approval, a real message and document |
| Pixel and Conversions API       | Request body shape, hashing against Meta's published examples    | Events Manager: Test Events, deduplication, match quality     |
| Product feed                    | Required fields and formats on every item                        | The feed accepted in Commerce Manager (and Merchant Center)   |
| Reports                         | Numbers match the database, CSV opens in Excel                   | A glance at the real numbers after the first week             |
| Funnel report, Analytics Engine | Not possible locally: local sessions write no data to Cloudflare | Check after deploy that events arrive                         |

## Stage 18, 19 and 20 "Done when", split

The plan's criteria mix what the code does with what an account allows. This table separates them.

| Stage | Criterion                                                    | Verified now, locally                                 | Needs the client's accounts                      |
| ----- | ------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------ |
| 18    | Templates submitted and synced                               | Request shape in code review                          | A Meta app, a WhatsApp Business Account, a token |
| 18    | Shipped update arrives with tracking code and link           | Parameter mapping in the admin test send              | A test number and an approved template           |
| 18    | Invoice PDF arrives as a document                            | The invoice and its PDF exist and download            | An approved document template                    |
| 18    | Delivery and read statuses update the log                    | `whatsapp-status` (forward-only, signature)           | Meta's own delivery callbacks                    |
| 18    | Disabled or unapproved templates are skipped and logged      | Notification log shows "skipped" with the reason      | Nothing                                          |
| 19    | Without consent no Meta request is made                      | `npm run test:consent` (real browser)                 | Nothing                                          |
| 19    | With consent the Pixel fires; browser and server deduplicate | Body shape and hashing match Meta's examples          | A Pixel, a CAPI token, Test Events               |
| 19    | Analytics Engine receives events                             | Not possible locally                                  | A deployed Worker, then the SQL API              |
| 19    | The feed validates in Commerce Manager                       | Required fields and formats on every item             | A catalog in Commerce Manager                    |
| 20    | Every report renders on a phone with correct numbers         | Smoke test (sales) and the procedure for the others   | Nothing                                          |
| 20    | Deltas, CSV in Excel                                         | CSV BOM and totals checked                            | Nothing                                          |
| 20    | The weekly summary arrives at the configured time            | Set the weekday and hour to now, trigger the cron URL | A sending domain, to see it in an inbox          |

## Pre-launch checklist for a client

Do these on the client's real domain, with the client's accounts, before the announcement. The procedures are in
[TESTING_INTEGRATIONS.md](./TESTING_INTEGRATIONS.md).

1. Deploy (see [NEW_CLIENT.md](./NEW_CLIENT.md)). Open the store on the custom domain and check `x-page-cache` reaches `HIT` on
   a second visit.
2. Set the live secrets with `npm run client:secrets` and switch `DLOCALGO_ENV` and `PAYPAL_ENV` to `live` only at this point.
3. One real card payment of the smallest amount, then a refund made in the provider's dashboard (the store records it; it never
   calls a refund API). One real PayPal payment, then the same.
4. Email: the sending domain is onboarded, a test order's emails arrive in the inbox and not in spam, links open the right pages.
5. WhatsApp (if used): templates approved in both languages, one real message and one invoice document received.
6. Meta (if used): remove `metaTestEventCode` from Settings > Marketing, confirm events still arrive, check the match quality.
7. The consent banner appears for a new visitor and nothing is sent to Meta until it is accepted.
8. Phone check: home, a product, cart and checkout on a real phone over mobile data.
9. Add real products and photos in the admin. The demo scripts refuse non-local addresses on purpose, so demo content is never
   loaded into a client's store by accident.
10. Run Lighthouse on the home page and a product page; keep the scores in the client's file.

## Known gaps and accepted risks

- **Development-only audit warning.** `npm audit` reports a high-severity regular-expression denial of service in `braces`, pulled
  in only by the ESLint Astro plugin. It never runs in the Worker. npm's version list has no patched `braces` release yet, and
  pinning the older plugin only reduced the findings from five to four, so the dependency stays as it is. `npm audit
--omit=dev` reports nothing. Recheck on each template release.
- **The PayPal error paths** cannot be reached from the storefront in the sandbox. PayPal's negative-testing header is described
  in [TESTING_INTEGRATIONS.md](./TESTING_INTEGRATIONS.md); to exercise it the capture call has to be made by hand.
- **dLocal Go has no documented way** to force an expired or cancelled payment, or a pending card result, in the sandbox. The
  declined test cards cover the failure path; expiry and cancellation are covered by the store's own stale-order job.
- **Provider facts change.** Everything marked "docs" below was read on 2026-10-23. Prices, limits and API versions move;
  re-read the linked page before relying on a number.
