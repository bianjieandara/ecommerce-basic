# Audit report

Audit of the template on 2026-10-22 and 2026-10-23, in four rounds (the fourth is the deep pass over every link, filter and action). It lists what was checked, what was found, what was fixed
(with the commit), and what is still open. The commands to repeat every check are at the end.

**Result in one line.** Twenty-six findings, all fixed; one was serious (a store's saved theme never showed in a production build) and
one was a settings screen that did nothing (the out-of-stock products setting). The deep pass added ten test files
(`npm run test:all`): about 2,340 checks over every page, link, filter, action, order state and keyboard path, all passing. What is
still open cannot be fixed from this repository: an upstream package without a patch, work that needs the client's accounts, the
builder's unfinished stages and a deployment.

## Findings

Severity: **High** can break a core promise or lose money; **Medium** is wrong behaviour a customer or owner would notice;
**Low** is polish, accessibility or hygiene.

| #   | Severity | Area          | Finding                                                                                                                                                                                        | Status                                                                                                                    |
| --- | -------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | Theme         | The colours and typeface saved in the admin never applied in a production build: the bundled stylesheet's defaults came later and won at equal specificity.                                    | Fixed, `09f810e`                                                                                                          |
| 2   | Medium   | SEO           | The title and description written for search engines in the page editor were ignored by the home page, custom pages and the contact page (the contact page had none).                          | Fixed, `9b9b944`                                                                                                          |
| 3   | Medium   | Marketing     | A phone typed without a country code (`300 555 0101`) was hashed for Meta as typed, and `0057...` kept its `00`; Meta matches only normalised numbers.                                         | Fixed, `e49cd8c`                                                                                                          |
| 4   | Medium   | Data          | The default "featured" sort and the media library ordered by a timestamp alone, so rows created at the same instant could repeat or vanish between pages. Stale-order query had the same flaw. | Fixed, in `8de8bcd`                                                                                                       |
| 5   | Medium   | Payments      | A payment that arrives for an order already cancelled is not applied (correct, stock may be sold) but was silent: money taken, nothing told to anyone.                                         | Fixed: logged and emailed to the store team (`payment_late_store`); run end to end on the dLocal Go sandbox               |
| 6   | Low      | Accessibility | Footer text and the default accent colour failed the 4.5:1 contrast rule (3.93 and 4.34). Faded grey text and struck-through prices too.                                                       | Fixed, `9b9b944` and accent `cf3426`                                                                                      |
| 7   | Low      | SEO           | The home page had no `h1`.                                                                                                                                                                     | Fixed, `9b9b944`                                                                                                          |
| 8   | Low      | Admin         | Owner-only screens (users, settings, jobs, WhatsApp) showed "no permission" with HTTP 200. No data was shown, but the status was wrong.                                                        | Fixed, in `0773d49`                                                                                                       |
| 9   | Low      | i18n          | Carousel arrows, the main and mobile navigation and the breadcrumb had English accessible names on Spanish pages.                                                                              | Fixed, in `8de8bcd`                                                                                                       |
| 10  | Low      | Mobile        | Footer links and the up/down buttons in admin lists were narrower than 44 px (25 px in the category manager).                                                                                  | Fixed, in `8de8bcd`                                                                                                       |
| 11  | Low      | Data          | Saving an attribute ran one query per removed value.                                                                                                                                           | Fixed (one `json_each` query), in `8de8bcd`                                                                               |
| 12  | Low      | Branding      | The store's favicon was the Astro rocket, and the guide had none (a 404 on every page).                                                                                                        | Fixed, in `8de8bcd`                                                                                                       |
| 13  | Low      | Hygiene       | The unused `stripe` package, its variable names in the generated types and every Stripe mention outside the migrations.                                                                        | Fixed, `9b9b944`, `8be57bd`                                                                                               |
| 14  | Low      | Docs          | The guide had no 404 page; two button names in the new test guide differed from the UI ("Presentar en Meta", "Actualizar estado", "Enviar prueba a mí").                                       | Fixed                                                                                                                     |
| 15  | Low      | Payments      | dLocal Go refuses a reused `order_id` (error 5009), and the store sent the bare order number, so two databases on one account clashed.                                                         | Fixed: `<number>-<first 8 of the order id>`                                                                               |
| 16  | Low      | Marketing     | One product feed for two services that spell availability differently (`in stock` for Meta, `in_stock` for Google).                                                                            | Fixed: `?target=meta` (default) and `?target=google`                                                                      |
| 17  | Low      | Admin         | After the sign-in page the visitor returned to the page but lost its query (`?status=paid`).                                                                                                   | Fixed                                                                                                                     |
| 18  | Process  | Tests         | The access, role and consent checks were one-off scripts.                                                                                                                                      | Fixed: `npm run test:access`, `npm run test:consent`                                                                      |
| 19  | Medium   | Catalog       | Settings > Catalog offered "Out-of-stock products: at the end / hide / like any other" and "Show stock on the product", and no code read them.                                                 | Fixed: lists, counts, facets, suggestions and related products follow it; the product page words its stock by the setting |
| 20  | Medium   | Admin         | A search of about 80 characters on Orders or Invoices was a 500 (D1 refuses a LIKE pattern over 50 bytes).                                                                                     | Fixed: `containsText` falls back to `instr()`                                                                             |
| 21  | Medium   | SEO           | `/shop?page=999` answered 200 "No products match your filters" under an indexable address.                                                                                                     | Fixed: 301 to the last real page, filters kept                                                                            |
| 22  | Low      | Shop          | Switching language on a filtered shop page dropped the filters.                                                                                                                                | Fixed: the language link keeps prices, values, flags and sort                                                             |
| 23  | Low      | Contact       | The phone link was `tel:+57 300 000 0000`, with spaces, which the scheme does not allow. The WhatsApp card showed bare digits.                                                                 | Fixed: digits and a leading "+"                                                                                           |
| 24  | Medium   | Accessibility | No skip-to-content link: a keyboard user tabbed through the whole header on every page.                                                                                                        | Fixed: first Tab stop on every page, `<main id="main">`                                                                   |
| 25  | Low      | Docs          | The guide still described a contact form and a Messages screen that the owner removed.                                                                                                         | Fixed in Spanish and English; 96 screenshots retaken                                                                      |
| 26  | Process  | Tests         | The checks of links, filters, actions, orders and keyboard did not exist.                                                                                                                      | Fixed: `test:crawl`, `filters`, `admin-filters`, `admin-actions`, `flows`, `orders`, `keyboard`, `all`                    |

"in `8de8bcd`" means the change was committed by the other working session when it committed the shared working tree; the work is
mine and is in history.

## Observations (behaviour that is by design)

Found while testing and left as they are, because each is a documented choice with a reason:

- An order refunded within seconds of its payment, before the invoice job runs, gets no invoice: only paid orders do.
- Saving a product twice with the same "stock before" applies the stock change twice, so that a sale made while the form was open is
  never undone. The editor reloads its numbers after each save.
- Only the invoice of a cancelled or refunded order can be voided: the books must not lose a sale that still stands.
- "Paid" and "cancelled" are both legal in sequence, so two different changes at the same moment can both succeed; two identical ones
  cannot (tested: one wins, the stock comes back once, one invoice).
- An unknown report address falls back to the sales report instead of showing a 404.
- The contact form's backend is gone, but the `contact_*` email templates and the `contact_messages` table remain.
- Unused exports: `isProductPath`, `addMoney`, `multiplyMoney` and `NullPdfRenderer`.

## Open items

None of these can be closed by a change in this repository. Each says why, and what closes it.

1. **Refunds made in a provider's dashboard.** The admin now refunds in full through dLocal Go and PayPal (owners only), checked
   on both sandboxes. A refund made in PayPal's dashboard is still not seen by the store (refund events are ignored), so those orders
   are marked refunded by hand. Partial refunds are also made in the dashboard.
2. **Development-only `npm audit` finding** (regular-expression denial of service in `braces`, through the ESLint Astro plugin). npm has
   no patched `braces` (3.0.3 is the latest); pinning the older plugin cleared nothing. It never runs in the Worker, and
   `npm audit --omit=dev` is clean. Closed by an upstream release.
3. **Email delivery, WhatsApp and Meta against the real services.** They need the client's accounts (a sending domain, a Meta app and
   number, a Pixel). The procedures are written down; the local parts are tested. Real dLocal Go sandbox payments were run in this audit
   (card payment, signed webhook, late payment). A PayPal sandbox payment was not repeated.
4. **Stages 18, 20 and 25 are unfinished** (the builder's), and Stage 19's browser-to-server deduplication needs a real Pixel. The
   consent part of Stage 19 is verified.
5. **The public demo store still runs an old deployment** and has no products. Deploying needs the owner's Cloudflare login and was not
   done.

## What was checked

| Area                          | How                                                                                                                                                                 | Result                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Types, lint, formatting       | `npm run check`                                                                                                                                                     | 0 errors                                                       |
| Build                         | `npm run build`, `npm run docs:build`                                                                                                                               | Passes                                                         |
| Functional                    | `npm run test:smoke` on the demo store                                                                                                                              | 180 checks (pages, admin, API, 5 checkouts, PDF, report, feed) |
| Anonymous access              | Every admin API route, GET and POST, no session                                                                                                                     | 52 of 52 refuse                                                |
| Roles and sessions            | An editor against 6 owner-only screens and 9 owner-only actions; deactivated, expired, unknown sessions                                                             | 26 of 26                                                       |
| Consent (Stage 19)            | `npm run test:consent`: banner, Pixel requests before and after a choice, persistence                                                                               | 8 of 8 in Chrome                                               |
| Real sandbox payment          | dLocal Go card payment through the hosted page, signed webhook, late payment on a cancelled order                                                                   | Paid; alert emailed; no duplicate on retry                     |
| Links and tags                | `test:crawl`: every link, image, script and language alternate on about 300 pages, storefront and admin                                                             | No problems                                                    |
| Storefront filters            | `test:filters`: every sort, category, attribute value, flag, price range, search, page, count and URL, in 3 stock modes and 2 languages                             | 1,647 checks                                                   |
| Admin filters                 | `test:admin-filters`: orders, products, inventory, invoices, movements, log paging, long and special searches                                                       | 140 checks                                                     |
| Admin actions                 | `test:admin-actions`: every create, edit, delete and status action, with invalid, duplicate and in-use cases, and every settings group                              | 162 checks                                                     |
| Shopper flows                 | `test:flows`: cart, checkout, order page, search overlay, language switch, contact links, back-in-stock, filter panel, in Chrome                                    | 43 checks                                                      |
| Orders and accounts           | `test:orders`: order validation, price tampering, last-unit race, every status, stock and invoices, expiry, CSV injection, 11 reports x 8 ranges, invite to sign-in | 108 checks                                                     |
| Keyboard                      | `test:keyboard`: skip link, focus rings on 6 pages, dialogs, Escape, focus return, cookie banner, filter drawer                                                     | 25 checks                                                      |
| Webhooks                      | Signed and unsigned calls (`npm run test:webhooks`)                                                                                                                 | Valid accepted, invalid refused (400/403)                      |
| Cross-site and redirects      | `text/plain` and form POSTs from another origin; CORS preflight; `next` payloads on the login page                                                                  | Refused; no CORS grant; no open redirect                       |
| Money rules                   | Read `PlaceOrder`, `ConfirmPayment`, order state machine                                                                                                            | Server reprices; amount and currency matched; states final     |
| Exports                       | CSV formula guard on every export; BOM for Excel; sales report equals a direct database count                                                                       | Pass                                                           |
| Queries                       | `EXPLAIN QUERY PLAN` on 11 hot queries; scan for queries in loops, ordering, `LIKE` escaping                                                                        | All use an index; 4 violations fixed                           |
| Translations                  | 1,201 keys compared in both languages; placeholders; hardcoded labels                                                                                               | Parity; 5 English labels fixed                                 |
| Performance and accessibility | Lighthouse (phone) on 7 storefront and 11 admin pages                                                                                                               | 97 to 100 performance, 100 accessibility after fixes           |
| Mobile                        | 31 pages at 360 px: horizontal overflow and targets under 44 px                                                                                                     | 0 overflow; 0 small targets after fixes                        |
| Guide                         | 1,897 internal links and assets; bold UI terms against the dictionaries                                                                                             | 0 broken; labels corrected                                     |
| Secrets                       | Tracked files and git history                                                                                                                                       | None found                                                     |
| Live site (read-only)         | Pages, sitemap, robots, health, 404, headers                                                                                                                        | Works; old deployment                                          |

## Not covered

Load and concurrency beyond the existing oversell check; a review of every file line by line (the money, access and order code
were read, the rest was tested through behaviour); the real inbox, WhatsApp and Meta round trips; browsers other than Chrome; a
second language beyond Spanish and English.

## How to repeat it

```bash
npm run check && npm run build
npm run docs:store            # leave running; then in another terminal:
npm run docs:data
npm run test:smoke            # about 3 minutes
npm run test:access           # anonymous access and roles
npm run test:consent          # Pixel only after consent (needs Chrome)
npm run test:all              # every test file, one after the other (about 15 minutes)
npm run test:webhooks -- whatsapp-verify
npm audit --omit=dev
```

The query-plan, translation, mobile-layout and guide-link checks were one-off scripts and are described in the table above;
they can be moved under `scripts/test/` on request.
