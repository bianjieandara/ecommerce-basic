# Testing the integrations

Procedures for level 3 of [TESTING.md](./TESTING.md): the real providers, in their test modes. Each section says what you can do
locally first, what needs the client's sandbox or test account, what you should see, and what the usual failures mean. Facts
about a provider come from its official documentation, read on 2026-10-23; the page is linked so you can re-read it.

Contents: [dLocal Go](#dlocal-go-cards-and-local-methods) · [PayPal](#paypal) · [Manual methods](#manual-payment-methods) ·
[Email](#email) · [WhatsApp](#whatsapp) · [Meta tracking and the feed](#meta-pixel-conversions-api-and-the-product-feed) ·
[Reports and scheduled jobs](#reports-and-scheduled-jobs) · [Platform pieces](#platform-pieces)

## dLocal Go (cards and local methods)

Secrets: `DLOCALGO_API_KEY`, `DLOCALGO_SECRET_KEY` (and `DLOCALGO_SMART_FIELDS_KEY`). `DLOCALGO_ENV` is `sandbox` or `live`; the
sandbox and live keys are different. Sandbox keys: sign up at <https://dashboard-sbx.dlocalgo.com/signup>, then Integrations >
API Integration shows the Sandbox API Key and Sandbox Secret Key. The sandbox API is `https://api-sbx.dlocalgo.com`
([docs](https://docs.dlocalgo.com/)).

**Steps**

1. Put the sandbox keys in `.dev.vars`, restart the store.
2. Add a product to the cart, go to checkout, choose the card method. The store creates a payment and sends you to dLocal Go's
   hosted page.
3. Pay with a test card (any future expiry, any CVV). The outcome is decided by the card number:

| Card number         | Result                      |
| ------------------- | --------------------------- |
| 4111 1111 1111 1111 | Approved                    |
| 4242 4242 4242 4242 | Approved                    |
| 5555 5555 5555 4444 | Rejected by bank            |
| 4000 0566 5566 5556 | Insufficient amount         |
| 2223 0031 2200 3222 | Call bank for authorization |
| 5186 0017 0000 9726 | Card expired                |
| 4622 9431 2701 1022 | Card restricted by the bank |
| 5105 1051 0510 5100 | Invalid security code       |
| 5120 3501 0006 4537 | Rejected due to high risk   |

4. After an approved payment the customer returns to the order page, which shows "paid" once the store has asked dLocal Go for the
   payment status. Check `/admin/orders/<number>`: status `paid`, a timeline entry from the provider, an invoice issued.

**What to see for each outcome**

| Outcome        | Order                                                                                            | Customer                        |
| -------------- | ------------------------------------------------------------------------------------------------ | ------------------------------- |
| Approved       | `paid`, stock confirmed, invoice and emails                                                      | Order page says paid            |
| Rejected cards | Stays `pending_payment`; no invoice                                                              | Can retry on the dLocal Go page |
| Abandoned      | Stale-order job expires it later and releases the stock                                          | Nothing                         |
| Refunded       | Refund in the dLocal Go dashboard; the webhook moves the order to `refunded` and sends the email | Refund email                    |

**Webhook.** dLocal Go posts only `{"payment_id": "..."}` to the notification URL, signed in the `Authorization` header as
`V2-HMAC-SHA256, Signature: <hex>`, where the hex is HMAC-SHA256 of the API key followed by the raw body, keyed with the secret key
([docs](https://docs.dlocalgo.com/integration-api/welcome-to-dlocal-go-api/payments/notifications.md)). The store verifies that on
the raw bytes, then asks dLocal Go for the payment and applies the answer once (repeats are ignored). Any failure answers an
error, and dLocal Go retries every 10 minutes for up to 30 days.

- Locally: `npm run test:webhooks -- dlocalgo DP-0000` and `... --bad` (see TESTING.md). dLocal Go can only call a public URL, so
  for a real notification use a tunnel (`cloudflared tunnel --url http://localhost:4321`). The docs do not say whether the
  notification URL must be HTTPS; use HTTPS.
- Payment statuses: `PENDING`, `PAID`, `REJECTED`, `CANCELLED`, `EXPIRED`. The hosted link expires after 24 hours and cannot be
  reused. The API allows 100 requests a minute per IP and endpoint (429 afterwards).

**Not documented by dLocal Go:** test data for local methods (PIX, vouchers, bank transfer), a pending test card, a way to force a
cancelled or expired payment, a dashboard button to resend a webhook, and idempotency keys (a duplicate `order_id` is error 5009).

| Symptom                                 | Likely cause                                                               |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Checkout answers a provider error       | Keys missing, or live keys with `DLOCALGO_ENV=sandbox` (or the reverse)    |
| Paid but the order stays pending        | The webhook did not arrive (no public URL) and the customer did not return |
| Webhook answers 400 `INVALID_SIGNATURE` | Wrong secret key, or the body was changed before verification              |
| 429 from dLocal Go                      | More than 100 requests a minute from one IP                                |

## PayPal

Secrets: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`; `PAYPAL_ENV` is `sandbox` or `live`. The store uses Orders
v2: it creates the order, the buyer approves on PayPal, and the return page captures it.

**Accounts.** Sandbox > Accounts at <https://developer.paypal.com/developer/accounts> has a default business and a default personal
(buyer) account (`sb-...@business.example.com`, `sb-...@personal.example.com`) and lets you create more
([docs](https://developer.paypal.com/tools/sandbox/accounts/)). Buyers sign in at <https://www.sandbox.paypal.com/>. The sandbox API
is `https://api-m.sandbox.paypal.com`. Keep a buyer's password in `.dev.vars` (as `PAYPAL_SANDBOX_BUYER_EMAIL` and
`PAYPAL_SANDBOX_BUYER_PASSWORD`), never in the repository.

**Steps**

1. Put the app's sandbox client id and secret in `.dev.vars`, restart.
2. Checkout with PayPal. On PayPal, sign in as the sandbox buyer and approve.
3. You return to the order page; the store captures the payment. The order becomes `paid`, an invoice is issued.
4. In the sandbox site you can see the transaction by signing in with any sandbox account.
5. Refund in PayPal (sign in to the sandbox business account > the transaction > Refund), not in the store: the store never calls
   PayPal's refund API. PayPal refunds are asynchronous, and the store does not handle PayPal refund webhooks, so afterwards move the
   order to `refunded` in the admin; that records it and sends the customer's refund email.

**Webhooks.** The store handles `PAYMENT.CAPTURE.COMPLETED` (paid) and `PAYMENT.CAPTURE.DENIED` (failed), for payments that finish
when the customer does not come back. Other events, refunds included, are acknowledged and ignored. It verifies each event by posting it to PayPal's `verify-webhook-signature`
([docs](https://developer.paypal.com/api/rest/webhooks/rest/)).

- **The dashboard simulator cannot pass that check, by design.** PayPal states that postback verification "is not supported for
  mock events". An event from the simulator (or `POST /v1/notifications/simulate-event`) sent to this store is therefore refused
  with 400. That is the correct result and proves the check works. To see an accepted event you need a real sandbox payment
  and a public URL (tunnel) registered as the webhook URL, with that webhook's id in `PAYPAL_WEBHOOK_ID`.
- PayPal retries a webhook that gets a non-2xx answer up to 25 times over 3 days.

**Negative testing (optional).** Turn on Negative Testing for a sandbox business account (Sandbox > Accounts > the account >
Settings). Then a request with the header `PayPal-Mock-Response: {"mock_application_codes": "<ERROR_NAME>"}` returns that error;
the valid names are on PayPal's Orders error-messages page
([docs](https://developer.paypal.com/negative-testing/request-headers/)). The storefront does not send this header, so make the
capture call by hand with `curl` and a sandbox access token to see how PayPal reports an error. The feature is marked beta, works
only in the sandbox and only with business accounts.

**Card numbers** on PayPal's card-testing page are for card fields (Expanded Checkout), not the wallet approval this store uses.

| Symptom                            | Likely cause                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Cannot sign in as the buyer        | Wrong sandbox account type, or a cloned account (its password is not copied)   |
| Approved on PayPal, order not paid | The return page was closed before capture; the webhook (public URL) catches it |
| Webhook answers 400                | Simulator event, wrong `PAYPAL_WEBHOOK_ID`, or live and sandbox mixed          |

## Manual payment methods

Bank transfer, cash on delivery and WhatsApp orders create the order as pending; the owner confirms payment by hand. The smoke
test places one of each. By hand: place an order, open it in `/admin/orders`, move it to `paid`, and check the invoice appears and
the customer's email is sent (or printed by the console transport).

## Email

Production sends through Cloudflare Email Service (`EMAIL_TRANSPORT=cloudflare`); locally `EMAIL_TRANSPORT=console` prints each
message to the terminal.

**Locally**

- Console transport: place an order, read the terminal. Every notification is also a row in `/admin/notification-log`.
- Each template: `/admin/emails/<key>` has a live preview in both languages and "send test" to the admin's own address. In
  `astro dev`, `/dev/emails/<key>?locale=en` renders the same with sample data.
- With a real `send_email` binding, `wrangler dev` simulates it: the message is logged and saved to local files, nothing is
  sent. Setting `"remote": true` on the binding sends real email from local code, so use only addresses you own
  ([docs](https://developers.cloudflare.com/email-service/local-development/sending/)). Binary attachments (the invoice PDF) fail in
  the local simulator with a serialization error; test the attachment after deploying.

**Real sending (client)**

1. Onboard the sending domain: Compute > Email Service > Email Sending > Onboard Domain. Cloudflare adds MX and SPF records on the
   `cf-bounce` subdomain, a DKIM record, and suggests a DMARC record (`p=none` for a new setup). Propagation is usually 5 to 15
   minutes on Cloudflare DNS ([docs](https://developers.cloudflare.com/email-service/configuration/domains/)).
2. Before onboarding, mail can go only to verified destination addresses of the account. After, to any recipient (this needs the
   Workers Paid plan).
3. Limits: 50 recipients per message, 5 MiB per message with attachments, subject up to 998 characters
   ([docs](https://developers.cloudflare.com/email-service/platform/limits/)). New accounts start with a conservative daily quota; the
   docs give no number.
4. Place a test order. Check the inbox and the spam folder, open the links, open the invoice PDF attachment.

| Symptom                              | Likely cause                                                         |
| ------------------------------------ | -------------------------------------------------------------------- |
| Nothing arrives                      | Domain not onboarded yet, or the recipient is not a verified address |
| Arrives in spam                      | DMARC or DKIM not propagated, or a sender address on another domain  |
| `failed` row in the notification log | The log keeps the provider's reason; retry from the log when fixed   |

## WhatsApp

Setup is in [WHATSAPP.md](./WHATSAPP.md). Nothing is sent unless WhatsApp is on in settings, the connection is set, the message is
enabled, and Meta approved the template in the recipient's language; anything else is logged as `skipped` with the reason.

**Locally (no Meta account)**

1. `npm run test:webhooks -- whatsapp-verify` checks the handshake: Meta calls `GET /api/webhooks/whatsapp` with `hub.mode`,
   `hub.verify_token`, `hub.challenge`; the store must answer the challenge as plain text, and answer 403 for a wrong token.
2. `npm run test:webhooks -- whatsapp-status wamid.TEST1 delivered` (then `read`, then `failed`) shows status updates:
   each delivery is signed with `X-Hub-Signature-256: sha256=<HMAC-SHA256 of the raw body with the app secret>`, a wrong signature
   gets 403, and a status only moves a log row forward, so a `failed` after `read` changes nothing.
3. In `/admin/whatsapp` the connection panel shows only whether each setting is set. With nothing set, a send test is skipped and
   logged, not failed.

**With Meta (client)**

1. App Dashboard > WhatsApp > API Setup creates a free test business number. Pick it as From, add your own phone as To, and send
   the `hello_world` template to confirm the token works
   ([docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)). The docs do not state how many
   test recipients are allowed or how each is verified; the dashboard tells you. Adding a payment method is required to send
   business-initiated messages to customers.
2. Webhook: App Dashboard > WhatsApp > Configuration. Callback URL `https://<domain>/api/webhooks/whatsapp` (use a tunnel
   locally), the verify token, and subscribe to `messages` and `message_template_status_update`. The same panel has a button that
   sends a sample payload to your endpoint. Some webhooks are not sent while the app is in Development mode
   ([docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview)).
3. In `/admin/whatsapp`: edit the body, map each `{{n}}` to a variable, **Submit to Meta**, then **Sync status**. Review takes up to
   24 hours ([docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review)).
   Rejections are commonly caused by variables not numbered in order, a template that starts or ends with a variable, special
   characters such as `#`, `$`, `%`, missing sample values, or too many variables for the text length.
4. After approval: **Send test** to your phone. Then mark an order shipped with a tracking code and check the message carries
   the code and the order link; issue an invoice and check the PDF arrives as a document.
5. Check `/admin/notification-log`: `sent`, then `delivered` and `read` as Meta calls the webhook.

Template statuses you will see in `message_template_status_update`: `APPROVED`, `PENDING`, `REJECTED`, `PAUSED`, `DISABLED`
(and `FLAGGED`, `IN_APPEAL`, `LIMIT_EXCEEDED`, `LOCKED`, `ARCHIVED`, `REINSTATED`, `DELETED`). A rejection carries a reason such as
`INVALID_FORMAT`, `INCORRECT_CATEGORY`, `ABUSIVE_CONTENT`, `SCAM`, `PROMOTIONAL` or `TAG_CONTENT_MISMATCH`
([reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_status_update)).

| Meta error | Meaning                                                              | What to do                                           |
| ---------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| 132000     | Number of variables does not match the template                      | Fix the parameter mapping                            |
| 132001     | Template missing in that language, or not approved                   | Submit or wait for approval in that language         |
| 132012     | Variable values formatted incorrectly                                | Check the formatting of the values                   |
| 132015     | Template paused for low quality                                      | Review the text; Meta may unpause                    |
| 132016     | Template permanently disabled                                        | Create a new template with a new name                |
| 131026     | Message undeliverable (not on WhatsApp, old app, terms not accepted) | Nothing to retry; check the number                   |
| 131047     | More than 24 hours since the customer last wrote                     | Use a template (the store always does)               |
| 131049     | Not delivered to protect user experience                             | Wait at least 24 hours before resending              |
| 131050     | The customer stopped marketing messages                              | Respect it                                           |
| 131056     | Too many messages to one number in a short time                      | Slow down                                            |
| 133010     | Phone number not registered                                          | Register the number in the WhatsApp Business Account |
| 190        | Token expired or invalid                                             | Create a new system-user token                       |
| 130429     | Throughput limit                                                     | The queue retries                                    |

([error codes](https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes))

**Rules to remember.** Outside the 24-hour customer-service window only templates may be sent. Meta bills per delivered template
message since 1 July 2025, by category and destination; the pricing page also lists changes from 1 October 2026 for utility messages
inside an open window and 1,000 free service messages per number per month, so read it before quoting a price to a client
([pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)). Messaging customers needs their
opt-in, which checkout and the back-in-stock form collect. `META_GRAPH_VERSION` is empty by default, and WhatsApp and the Conversions API
stay off until it is set: use a current version (Meta's examples currently show v23.0 to v26.0).

## Meta Pixel, Conversions API and the product feed

Settings > Marketing holds `metaPixelId`, `metaCapiEnabled`, `metaTestEventCode`, the consent banner mode and the feed options.
The Conversions API token is the secret `META_CAPI_TOKEN`.

> **Status.** Stage 19 (consent, tracking, Meta) was still being finished when this guide was written. The behaviour described
> below is the one in the plan's "Done when". Where a step does not behave that way, that is a defect to fix in the template, not a
> mistake in the test. Only the body shape, the hashing and the feed checks have been run against the code so far.

**1. Consent (locally, no account)**

1. Open the demo store in a private window with DevTools > Network open. Before choosing anything, no request goes to Meta (the
   Pixel script loads from `connect.facebook.net` and sends to `www.facebook.com/tr`; those are the usual Pixel hosts).
2. Accept marketing in the banner: with a Pixel id set, the Pixel script loads and events are sent. Decline: nothing is sent.
3. The choice is stored in the `consent` cookie (`v1.m1` accepted, `v1.m0` declined); the footer's "Privacy settings" link changes
   it.

**2. The Pixel and Test Events (client)**

1. In Events Manager > Data sources > your Pixel > Test Events, enter the store URL and open it. Install the browser extension
   **Meta Ads Data Advisor** (formerly Meta Pixel Helper, Chrome and Edge) to see each event and its parameters
   ([docs](https://developers.facebook.com/docs/meta-pixel/support/pixel-helper/)).
2. Walk the funnel: view a product (`ViewContent`), add to cart (`AddToCart`), start checkout (`InitiateCheckout`), pay
   (`Purchase`). Each appears in Test Events within about 20 minutes at most.

**3. The Conversions API and deduplication (client)**

1. Copy the test code from the Test Events tab into `metaTestEventCode`. Enable `metaCapiEnabled`, set `META_CAPI_TOKEN`.
2. Repeat the funnel. Each event should appear twice, browser and server, with the same `event_id`; Meta discards the second one
   when `event_name` and `event_id` match within 48 hours ([docs](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)).
   The Event Deduplication view in Events Manager shows the rate.
3. Open Event Match Quality; Meta suggests aiming for 6.0 or higher
   ([docs](https://developers.facebook.com/docs/marketing-api/conversions-api/verifying-setup)).
4. **Clear `metaTestEventCode` before launch.** Events sent with a test code are not dropped: they still count for measurement.

What the store sends (checked against Meta's pages): `POST /{pixel_id}/events` with `event_name`, `event_time`, `event_id`,
`action_source: "website"`, `event_source_url`, and `user_data` holding `em` and `ph` as SHA-256 hashes and `client_ip_address`,
`client_user_agent`, `fbp`, `fbc` unhashed. Email is trimmed and lowercased; phone is digits with the country code and no leading
zeros. Meta's published examples hash to `62a14e44...f62f` for `John_Smith@gmail.com` and `e323ec62...3176` for `(650)555-1212`
with country code 1; the store's normalisation reproduces both, and a phone typed without a country code gets the store's default
code. Hashes are sent only when the customer gave marketing consent at checkout.

**4. The product feed**

1. Locally: `npm run test:smoke` validates every item (see TESTING.md). Open `/feeds/products.xml?locale=en` to read it.
2. Required fields in both Meta and Google: `g:id` (up to 50 characters), `g:title` (up to 150), `g:description` (up to 5000),
   `g:link`, `g:image_link`, `g:availability` (`in_stock`, `out_of_stock`, `preorder`, `backorder`) and `g:price` as `12.00 USD`
   ([Google spec](https://support.google.com/merchants/answer/7052112)). Variants share `g:item_group_id`.
3. Meta accepts CSV, TSV, RSS XML and ATOM XML; a scheduled feed fetches at most once an hour. In Commerce Manager create a data
   source from the feed URL, then read Diagnostics: "fatal" items are not ingested, "warning" items miss a recommended field
   ([docs](https://developers.facebook.com/documentation/ads-commerce/catalog/guides/feed-api)).
4. Google Merchant Center reads the same file; its Issue Details page lists problems per product.

**5. Analytics Engine (after deploy)**

Local sessions write nothing to Cloudflare's dataset, so the funnel report stays empty locally. After deploying, browse the store
and query the dataset: `POST https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql` with the SQL as the
body and an API token with "Account Analytics: Read"
([docs](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)). The plan assumes 90 days of retention; the pages
read did not state it, so confirm on Cloudflare's limits page.

| Symptom                              | Likely cause                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| No browser events in Test Events     | No consent given, wrong Pixel id, or an ad blocker                               |
| Server events only, no deduplication | Browser and server `event_id` differ, or the event names differ                  |
| Low match quality                    | No email or phone sent (no consent at checkout), or a phone without country code |
| Feed items rejected                  | Price without currency, missing image or availability                            |

## Reports and scheduled jobs

**Reports.** Every report is at `/admin/reports/<name>` with a date range, a comparison with the previous period and a CSV link.
The CSV is generated from the same call as the screen, starts with a UTF-8 BOM so Excel shows accents, and accepts `?sep=;` for
spreadsheets that use semicolons. Revenue counts orders in `paid`, `processing`, `shipped` and `delivered` by `paid_at`; refunds are
shown separately.

1. Place and pay a few orders (`npm run docs:data` creates a set).
2. Open `sales`, pick a range, and compare with the database:
   `SELECT COUNT(*), SUM(total_minor) FROM orders WHERE status IN ('paid','processing','shipped','delivered') AND paid_at >= '...'
AND paid_at < '...'` (amounts are minor units: divide by 100). The smoke test does this check for you.
3. Do the same spot check for `products` (units sold), `payments` and `taxes` against `order_items` and `orders`.
4. Open the CSV in Excel or Sheets: accents are right, numbers are numbers, and the totals equal the screen.
5. On a phone-width window every report stays readable (no horizontal page scroll).

**Scheduled jobs.** One cron tick does the periodic work and is idempotent. Locally nothing runs by itself, so trigger a tick:
`curl "http://localhost:4400/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"`. Then look at `/admin/jobs` (failed jobs, retry or discard) and
the notification log.

- **Weekly summary:** due on the weekday and hour in Settings > Reports, in the store's time zone. To test it, set them to the current
  weekday and hour, trigger a tick, and read the `weekly_report_store` email (printed by the console transport).
- **Daily roll-up and purge:** the same tick enqueues them; the roll-up needs Analytics Engine data to be meaningful.
- **Retries:** the queue retries a failing job 5 times, 30 seconds apart (`wrangler.base.jsonc`); a job that runs out of retries is
  written to `/admin/jobs`, where it can be retried or discarded. Cloudflare keeps messages in a dead-letter queue for 4 days when
  nothing consumes them ([docs](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/)).

## Platform pieces

| Piece            | How to test                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Turnstile        | Test site keys: `1x00000000000000000000AA` always passes, `2x00000000000000000000AB` always fails, `3x00000000000000000000FF` forces a challenge. Test secrets: `1x0000000000000000000000000000000AA` passes, `2x...AA` fails, `3x...AA` answers "already spent". The dummy token is `XXXX.DUMMY.TOKEN.XXXX`; production secrets reject it ([docs](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)) |
| Rate limits      | Limits are 5 a minute for sign-in, 10 a minute for forms, 60 per 10 seconds for the API (`wrangler.base.jsonc`). They are enforced under `wrangler dev`: submit the contact form 11 times quickly and the last answers 429. Cloudflare counts approximately and per location ([docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/))                                                        |
| Page cache       | Works under `wrangler dev` on `localhost` (`x-page-cache: MISS` then `HIT`). On `*.workers.dev` it is off by design. Cloudflare says the Cache API is functional on custom domains ([docs](https://developers.cloudflare.com/workers/runtime-apis/cache/)). An admin save must produce a `MISS`                                                                                                                           |
| Queues and jobs  | Run locally with the Worker; consumer concurrency is not supported locally ([docs](https://developers.cloudflare.com/queues/configuration/local-development/)). Failed jobs show in `/admin/jobs`                                                                                                                                                                                                                         |
| D1               | Local data lives in the persist folder (`.wrangler/state` by default, `.wrangler/docs-state` for the demo store). Reset by deleting that folder; apply migrations with `wrangler d1 migrations apply DB --local --persist-to <folder>`                                                                                                                                                                                    |
| Security headers | `npm run test:smoke` checks them; after deploy, scan the domain at securityheaders.com                                                                                                                                                                                                                                                                                                                                    |
| Lighthouse       | `npx lighthouse http://localhost:4400/en/ --only-categories=performance,accessibility,best-practices,seo` against the demo store (mobile is the default)                                                                                                                                                                                                                                                                  |
