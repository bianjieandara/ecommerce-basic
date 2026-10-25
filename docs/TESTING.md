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
npm run docs:data             # in another terminal: products, pictures, home page, orders
npm run test:smoke            # about 2 minutes, 180+ checks
npm run test:webhooks -- whatsapp-verify
npm run test:access           # anonymous access to every admin route; an editor against owner-only screens
npm run test:consent          # the Pixel and GA4 stay off until the visitor accepts (needs Chrome)
npm run test:tracking         # purchases to GA4 and Meta, and the events in Chrome (own store, see below)
npm run test:crawl            # every link, image, script and tag on about 300 pages
npm run test:filters          # every storefront filter, sort, page and count against the database
npm run test:admin-filters    # the filters and searches of the admin lists
npm run test:admin-actions    # every admin create, edit, delete, setting and email
npm run test:flows            # cart, checkout, search and forms in Chrome
npm run test:orders           # order lifecycle, stock, invoices, reports, accounts
npm run test:reports          # report figures against independent SQL, weekly summary
npm run test:whatsapp         # WhatsApp templates and messages against a fake Graph API
npm run test:clients          # a second client: dry-run deploy:all, no shared resources
npm run test:keyboard         # keyboard, dialogs and focus rings in Chrome
npm run test:all              # all of the above, one after the other (about 25 minutes)
```

`docs:store` serves the production build with its own database in `.wrangler/docs-state`, so it never touches development data.
Re-run `npm run build` and restart it after code changes. Stop it with Ctrl+C; if a port stays busy, stop the leftover `workerd`
processes whose command line mentions `docs-state`.

## What the local kit covers

**`npm run test:tracking`** ([scripts/test/tracking.mjs](../scripts/test/tracking.mjs) and
[tracking-browser.mjs](../scripts/test/tracking-browser.mjs)) checks what GA4 and Meta receive, with no Google or Meta account. It needs
its own store, started with `--tracking`, so that a store on port 4400 is left alone. Replace the ports if they are taken:

```bash
npx astro build --outDir .wrangler/track-dist
DOCS_DIST=.wrangler/track-dist DOCS_PORT=4420 DOCS_STATE=.wrangler/track-state DOCS_GRAPH_PORT=5820 DOCS_GA4_PORT=5830 \
  DOCS_INSPECTOR_PORT=9420 node scripts/docs/store.mjs --tracking          # leave it running
DOCS_BASE=http://localhost:4420 DOCS_STATE=.wrangler/track-state DOCS_GRAPH_PORT=5820 DOCS_GA4_PORT=5830 npm run test:tracking
```

- **Server.** The test starts two fakes: GA4's Measurement Protocol (`fake-ga4.mjs`, which lists what a real request would get wrong)
  and the Graph API with its Conversions API route (`fake-graph.mjs`). It places four orders with different cookies (consent and GA
  cookies; none; consent without GA; refused with GA cookies), pays them as the owner, and checks that GA4 gets exactly one
  purchase, Meta exactly one for each consenting order, with the e-mail and phone only as hashes, and that the other orders leave no
  trace. It also checks which GA identity the order stored.
- **Browser.** Chrome refuses every request to Google and Meta, so nothing leaves the machine; each attempt is still counted. A visitor
  who accepts walks home, product, add to cart, checkout, an unpaid order page and a paid one: GA4 and the Pixel must get
  `page_view`, `view_item`, `add_to_cart`, `begin_checkout` and one `purchase` (not again on a reload) with the right facts. A visitor
  who refuses must give them nothing and trigger no request. The script policy of the build must refuse nothing the app loads, and
  must still refuse a script from an unlisted host.
- **Not covered.** Google and Meta accepting and attributing the events (that is the table below), and payments confirmed by a
  webhook: the test pays as the owner, which takes the same `ConfirmPayment` step the webhooks do.

`test:tracking` is not part of `test:all`: it needs its own store and fakes. `test:consent` also needs a store; point it at this one
with `DOCS_BASE`, `DOCS_STATE` and `DOCS_COOKIE` (the owner session file).

**`npm run test:smoke`** ([scripts/test/smoke.mjs](../scripts/test/smoke.mjs)) checks, on the demo store only:

- every public page in Spanish and English, 404s for unknown pages, `sitemap.xml`, `robots.txt`, the product feed, `/api/health`;
- security headers, and that a cross-site `text/plain` or form POST is refused and no CORS permission is granted;
- every admin page with a session, and that every one of them refuses an anonymous visitor;
- every email template page and its preview;
- the checkout for all five payment methods (bank transfer, cash on delivery, WhatsApp, dLocal Go, PayPal), the private order
  link (with and without its key), the contact page, cart validation;
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

**`npm run test:crawl`** ([scripts/test/crawl.mjs](../scripts/test/crawl.mjs)) follows every internal link, image, stylesheet, script and
language alternate from the home pages and from the admin (with the owner's session), about 300 pages. Per page: status, one `<title>`,
one `<h1>`, a meta description (public pages), `alt` on every image, no duplicate ids, no empty links, `rel="noopener"` on new-tab links,
canonical and `hreflang` tags. It only makes GET requests and never follows sign-out. Filter combinations are sampled, not all visited.

**`npm run test:filters`** ([scripts/test/filters.mjs](../scripts/test/filters.mjs)) takes an independent snapshot of the catalog from
the database, computes what each filter state must show, and compares it with the real pages in both languages and in each
"out-of-stock products" mode (normal, last, hide): every sort, category, attribute value, two values of one attribute (OR) and of two
attributes (AND), stock, sale and new flags, price ranges (also typed backwards), search words (with accents and upper case), 12
seeded random combinations per language, the products on every page in order, the total, the facet counts, the live count API, the
canonical redirects, nonsense in the URL, pages past the end, indexing rules, and that a draft product disappears everywhere.

**`npm run test:admin-filters`** ([scripts/test/admin-filters.mjs](../scripts/test/admin-filters.mjs)) does the same for the admin
lists (orders, products, inventory, invoices, stock movements) and checks that the log lists page correctly, including very long
searches and `%` or `_` typed as text.

**`npm run test:admin-actions`** ([scripts/test/admin-actions.mjs](../scripts/test/admin-actions.mjs)) runs every write action as the
owner with valid input (and reads the effect back from the database and the storefront), invalid input, duplicates and "in use"
cases: categories (parents, hiding, reorder, delete), attributes, products (draft, publish, edit with a stock change in the ledger,
duplicate, archive), inventory (adjust, set, CSV preview and import, export), shipping (free-over thresholds, pickup is never charged),
testimonials, pages (publish, SEO text, escaped scripts), every settings group, and email overrides with their preview.

**`npm run test:flows`** ([scripts/test/flows.mjs](../scripts/test/flows.mjs)) drives Chrome as a shopper: product options, quantity,
add to cart, the cart page, checkout validation and a real order, the order page and its key, the search overlay, the language
switch, the contact page links, the back-in-stock form and the filter panel in the page itself. Its records are removed afterwards.

**`npm run test:orders`** ([scripts/test/orders.mjs](../scripts/test/orders.mjs)) places orders (valid, invalid, price tampering, three
buyers for the last unit), walks every status an owner can set and the ones that must be refused, checks the stock and ledger after
each step, two identical changes at the same moment, the expiry job, invoices (numbers without gaps, the void rule), CSV exports for
formula injection, every report with eight ranges, and the whole admin account flow: invite, accept with the emailed link, sign in,
deactivate, promote, delete, and the last-owner protections. It paces itself around the form rate limit.

**`npm run test:reports`** ([scripts/test/reports.mjs](../scripts/test/reports.mjs)) recomputes what the reports show with its own SQL
and compares: orders, units, revenue, tax, shipping and refunds of the sales report (in total, by day, by week and by month), paid
orders and revenue per payment method, shipping per method, issued invoices, tax per rate, units per product and the top customer. It
checks the change against the previous period on two real days, that no report page scrolls sideways at 360px, and the weekly summary:
nothing is sent outside the configured weekday and hour or when it is off, one e-mail goes out at that hour, and a second tick in the
same hour sends nothing. It changes the reports setting through the API and puts it back. It creates no orders: run `test:orders`
first for a fuller database.

**`npm run test:whatsapp`** ([scripts/test/whatsapp.mjs](../scripts/test/whatsapp.mjs)) runs the whole WhatsApp flow of Stage 18 with no
Meta account. It starts [fake-graph.mjs](../scripts/test/fake-graph.mjs), a stand-in for the Graph API that applies the rules Meta
documents (variables numbered in order with a sample each, no variable at the start or end, a URL button ending in `{{1}}`, only
approved templates can be sent, the parameter count must match), and the demo store talks to it because `npm run docs:store` starts
with `META_GRAPH_BASE_URL` pointing there (restart the store after updating). The test saves, submits, reviews and syncs templates,
ships an order with a tracking code and checks the message to the customer's number (name, order number, code, order link that opens),
issues an invoice and checks the PDF upload and the document header, sends signed delivery statuses (`delivered`, `read`, a late
`failed` that must change nothing, a wrong signature that must be refused), and checks that a disabled template, one Meta has not
approved, a customer who did not opt in, and WhatsApp turned off all send nothing and are logged. It puts the two templates it uses
back as they were. What it cannot show is what only Meta decides: see "With Meta" in
[TESTING_INTEGRATIONS.md](./TESTING_INTEGRATIONS.md#whatsapp).

**`npm run test:clients`** ([scripts/test/clients.mjs](../scripts/test/clients.mjs)) needs no store and calls no Cloudflare API. It writes a
second client with placeholder ids, runs `deploy:all --dry-run`, checks both clients are planned with their own commands, that
their generated worker configs share no worker, database, bucket, queue, cache namespace, analytics dataset or rate-limit
namespace, and that a malformed or unknown slug is refused. It removes the client again. The real deployment of two clients and a
purchase on each is the manual part of [NEW_CLIENT.md](./NEW_CLIENT.md).

**`npm run test:keyboard`** ([scripts/test/keyboard.mjs](../scripts/test/keyboard.mjs)) presses real keys in Chrome: the skip link is
the first Tab stop, every Tab stop of six pages shows a focus ring, the search overlay and the cart drawer open from the keyboard,
trap focus, close with Escape and give focus back, the cookie banner works from the keyboard, and the filter drawer opens and closes
on a phone.

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
| Pixel, GA4, Conversions API     | Bodies, hashing, consent gating, events in Chrome, fake GA4/Meta | Test Events, GA4 DebugView, deduplication, match quality      |
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
| 19    | Without consent no Meta or Google request is made            | `npm run test:consent` (real browser)                 | Nothing                                          |
| 19    | With consent the Pixel fires; browser and server deduplicate | `npm run test:tracking`: events in Chrome, shared id  | A Pixel, a CAPI token, Test Events               |
| 19    | GA4 counts each purchase once, browser and server            | `npm run test:tracking`: one purchase to a fake GA4   | A GA4 property, an API secret, DebugView         |
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
