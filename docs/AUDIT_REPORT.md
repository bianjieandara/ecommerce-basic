# Audit report

Audit of the template on 2026-10-22 and 2026-10-23, in two rounds. It lists what was checked, what was found, what was fixed
(with the commit), and what is still open. The commands to repeat every check are at the end.

**Result in one line.** Thirteen findings were fixed and one mitigated; one was serious (a store's saved theme never showed in a
production build). The open risks are listed below, mainly late payments on cancelled orders and real provider round trips. All local
checks pass: type check, lint, build, 185 smoke checks, 26 role checks, 52 of 52 admin routes closed to anonymous users.

## Findings

Severity: **High** can break a core promise or lose money; **Medium** is wrong behaviour a customer or owner would notice;
**Low** is polish, accessibility or hygiene.

| #   | Severity | Area          | Finding                                                                                                                                                                                        | Status                                      |
| --- | -------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | High     | Theme         | The colours and typeface saved in the admin never applied in a production build: the bundled stylesheet's defaults came later and won at equal specificity.                                    | Fixed, `09f810e`                            |
| 2   | Medium   | SEO           | The title and description written for search engines in the page editor were ignored by the home page, custom pages and the contact page (the contact page had none).                          | Fixed, `9b9b944`                            |
| 3   | Medium   | Marketing     | A phone typed without a country code (`300 555 0101`) was hashed for Meta as typed, and `0057...` kept its `00`; Meta matches only normalised numbers.                                         | Fixed, `e49cd8c`                            |
| 4   | Medium   | Data          | The default "featured" sort and the media library ordered by a timestamp alone, so rows created at the same instant could repeat or vanish between pages. Stale-order query had the same flaw. | Fixed, in `8de8bcd`                         |
| 5   | Medium   | Payments      | A payment that arrives for an order already cancelled is not applied (correct, stock may be sold) but was silent: money taken, nothing told to anyone.                                         | Mitigated: logged. **Open**, see below      |
| 6   | Low      | Accessibility | Footer text and the default accent colour failed the 4.5:1 contrast rule (3.93 and 4.34). Faded grey text and struck-through prices too.                                                       | Fixed, `9b9b944` and accent `cf3426`        |
| 7   | Low      | SEO           | The home page had no `h1`.                                                                                                                                                                     | Fixed, `9b9b944`                            |
| 8   | Low      | Admin         | Owner-only screens (users, settings, jobs, WhatsApp) showed "no permission" with HTTP 200. No data was shown, but the status was wrong.                                                        | Fixed, in `0773d49`                         |
| 9   | Low      | i18n          | Carousel arrows, the main and mobile navigation and the breadcrumb had English accessible names on Spanish pages.                                                                              | Fixed, in `8de8bcd`                         |
| 10  | Low      | Mobile        | Footer links and the up/down buttons in admin lists were narrower than 44 px (25 px in the category manager).                                                                                  | Fixed, in `8de8bcd`                         |
| 11  | Low      | Data          | Saving an attribute ran one query per removed value.                                                                                                                                           | Fixed (one `json_each` query), in `8de8bcd` |
| 12  | Low      | Branding      | The store's favicon was the Astro rocket, and the guide had none (a 404 on every page).                                                                                                        | Fixed, in `8de8bcd`                         |
| 13  | Low      | Hygiene       | The unused `stripe` package, its variable names in the generated types and every Stripe mention outside the migrations.                                                                        | Fixed, `9b9b944`, `8be57bd`                 |
| 14  | Low      | Docs          | The guide had no 404 page; two button names in the new test guide differed from the UI ("Presentar en Meta", "Actualizar estado", "Enviar prueba a mí").                                       | Fixed                                       |

"in `8de8bcd`" means the change was committed by the other working session when it committed the shared working tree; the work is
mine and is in history.

## Open items and accepted risks

1. **Late payment on a cancelled order (finding 5).** The store logs `payment.late_for_cancelled_order` with the order number,
   provider, reference and amount. There is no screen or email for it, so the owner has to see it in the logs and refund in the
   provider's dashboard. Next step if wanted: an `order_alert_store` style message or a timeline entry.
2. **Refunds are recorded, not made.** The admin never calls a provider's refund API. dLocal Go refund notifications move the order
   to `refunded` by themselves; PayPal refund events are ignored, so those are marked by hand. This is the design, and it is
   documented in TESTING_INTEGRATIONS.md.
3. **dLocal Go refuses a reused order number** (error 5009, shown as a generic payment error). It happens only when two databases
   share one sandbox account, as the demo and development stores do. Each real store has its own account and a growing counter.
4. **Product feed availability spelling.** The feed writes `in stock` (Meta's spelling); Google's specification lists `in_stock`.
   Unconfirmed whether Google accepts the spaced form in RSS. Read Merchant Center's diagnostics on the first upload.
5. **Development-only `npm audit` finding** (regular-expression denial of service in `braces`, through the ESLint Astro plugin). No
   patched `braces` exists on npm; the plugin never runs in the Worker. `npm audit --omit=dev` is clean.
6. **Not tested against real providers** in this audit: card and PayPal payments, email delivery, WhatsApp, Meta Test Events. The
   earlier card and PayPal sandbox runs still stand. The procedures are in TESTING_INTEGRATIONS.md.
7. **Stages 18, 19, 20 and 25 are unfinished** (the builder's). Only what exists was tested. The consent behaviour of Stage 19 (no
   request to Meta before consent) was not observed.
8. **The public demo store still runs an old deployment** and has no products. Nothing in this audit was deployed.

## What was checked

| Area                          | How                                                                                                     | Result                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Types, lint, formatting       | `npm run check`                                                                                         | 0 errors                                                       |
| Build                         | `npm run build`, `npm run docs:build`                                                                   | Passes                                                         |
| Functional                    | `npm run test:smoke` on the demo store                                                                  | 185 checks (pages, admin, API, 5 checkouts, PDF, report, feed) |
| Anonymous access              | Every admin API route, GET and POST, no session                                                         | 52 of 52 refuse                                                |
| Roles and sessions            | An editor against 6 owner-only screens and 9 owner-only actions; deactivated, expired, unknown sessions | 26 of 26                                                       |
| Webhooks                      | Signed and unsigned calls (`npm run test:webhooks`)                                                     | Valid accepted, invalid refused (400/403)                      |
| Cross-site and redirects      | `text/plain` and form POSTs from another origin; CORS preflight; `next` payloads on the login page      | Refused; no CORS grant; no open redirect                       |
| Money rules                   | Read `PlaceOrder`, `ConfirmPayment`, order state machine                                                | Server reprices; amount and currency matched; states final     |
| Exports                       | CSV formula guard on every export; BOM for Excel; sales report equals a direct database count           | Pass                                                           |
| Queries                       | `EXPLAIN QUERY PLAN` on 11 hot queries; scan for queries in loops, ordering, `LIKE` escaping            | All use an index; 4 violations fixed                           |
| Translations                  | 1,201 keys compared in both languages; placeholders; hardcoded labels                                   | Parity; 5 English labels fixed                                 |
| Performance and accessibility | Lighthouse (phone) on 7 storefront and 11 admin pages                                                   | 97 to 100 performance, 100 accessibility after fixes           |
| Mobile                        | 31 pages at 360 px: horizontal overflow and targets under 44 px                                         | 0 overflow; 0 small targets after fixes                        |
| Guide                         | 1,897 internal links and assets; bold UI terms against the dictionaries                                 | 0 broken; labels corrected                                     |
| Secrets                       | Tracked files and git history                                                                           | None found                                                     |
| Live site (read-only)         | Pages, sitemap, robots, health, 404, headers                                                            | Works; old deployment                                          |

## Not covered

Load and concurrency beyond the existing oversell check; a review of every file line by line (the money, access and order code
were read, the rest was tested through behaviour); the real inbox, WhatsApp and Meta round trips; browsers other than Chrome; a
second language beyond Spanish and English.

## How to repeat it

```bash
npm run check && npm run build
npm run docs:store            # leave running; then in another terminal:
npm run docs:data
npm run test:smoke            # 185 checks, about 3 minutes
npm run test:webhooks -- whatsapp-verify
npm audit --omit=dev
```

The role, anonymous-access, query-plan, translation and mobile checks were run as one-off scripts and are described in the table
above; the ones worth keeping (anonymous access and roles) can be moved under `scripts/test/` on request.
