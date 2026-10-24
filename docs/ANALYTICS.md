# Analytics and tracking

The store records its own events in Workers Analytics Engine (dataset `EVENTS`, one per client) and sends
conversion events to Meta (Pixel in the browser, Conversions API on the server). This file describes what is
recorded, in which shape, and under which consent rules.

The code lives in `src/application/ports/analytics.ts`, `src/infrastructure/analytics/analytics-engine-sink.ts` and
the product feed in `src/application/marketing/`.

**Status:** the writer, the event shape and the product feed are built. Not built yet: the middleware that writes
`page_view`, the `POST /api/events` endpoint, the consent banner, the browser tracking script and the Meta sinks.
The consent rules below are the target behaviour.

## Events

| Name             | Sent when                                         | Value and items                              |
| ---------------- | ------------------------------------------------- | -------------------------------------------- |
| `page_view`      | An HTML page of the storefront is served          | none                                         |
| `view_item`      | A product page is viewed (browser beacon)         | one item (the product and the variant shown) |
| `add_to_cart`    | A product is added to the cart                    | items, value = price times quantity          |
| `begin_checkout` | The checkout page is opened with a non-empty cart | items, value = cart total                    |
| `purchase`       | The payment is confirmed on the server            | items, value = order total, `orderId`        |

`page_view` is written by the server for every storefront HTML page. `view_item`, `add_to_cart` and `begin_checkout`
come from the browser (`POST /api/events`, at most 10 events per request). The server does not write `view_item`: the
beacon is its only source, so a product page is counted once and the event carries the pixel event id.
`purchase` is written by the server when the payment is confirmed, never from the browser. `page_view` and `purchase`
are refused by `POST /api/events`.

The Meta Pixel and GA4 get their own copy of the events in the browser (see "Google Analytics 4"). That copy never goes to
`POST /api/events`, and it includes `begin_checkout` (checkout page) and `purchase` (order page, see below).

## Analytics Engine data point

Written by `AnalyticsEngineSink` with `writeDataPoint`. The positions are fixed: append new fields at the end only,
because saved queries read blobs and doubles by position.

| Field      | Position | Content                                                                                                      |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| indexes[0] | -        | Client slug. Each client has its own dataset; the index keeps queries per client if datasets are ever merged |
| blobs[0]   | 0        | Event name, for example `purchase`                                                                           |
| blobs[1]   | 1        | Path of the page, for example `/es/products/mochila`; no origin, no query string                             |
| blobs[2]   | 2        | Product id of the first item, or empty                                                                       |
| blobs[3]   | 3        | Variant id of the first item, or empty                                                                       |
| blobs[4]   | 4        | Two-letter country code from the request, or empty                                                           |
| blobs[5]   | 5        | Device class: `mobile`, `tablet` or `desktop`                                                                |
| blobs[6]   | 6        | Host of the referrer (no path), or empty                                                                     |
| blobs[7]   | 7        | `utm_source`, or empty                                                                                       |
| blobs[8]   | 8        | `utm_campaign`, or empty                                                                                     |
| blobs[9]   | 9        | Language of the page: `es` or `en`                                                                           |
| doubles[0] | 0        | Event value in minor units (0 when the event has no value)                                                   |
| doubles[1] | 1        | Units: the sum of the item quantities (0 when the event has no items)                                        |

Notes:

- Money is in minor units, like everywhere else. The currency is not in the data point because each client sells in one
  currency (`general.currency`); read it from settings when reporting.
- Multi-item events (`begin_checkout`, `purchase`) write the first item's product and variant only. Item-level detail
  stays in D1 (orders), not in Analytics Engine.
- The writer never stores the IP address, the user agent, the email, the phone, `fbp`, `fbc` or the query string.
- Writes are non-blocking. A failed write is logged as `analytics.write_failed` and dropped; it never fails a request.

## Consent rules

- The store's own events are cookieless and aggregate. They run without marketing consent and are described in the
  privacy policy. They contain no personal data, so no consent choice changes what is written.
- Meta and Google Analytics 4 are the only third parties. The Meta Pixel script and `gtag.js` are injected, and `fbq` and
  `gtag` calls are made, only after the visitor grants the `marketing` category. Without consent, the browser makes no
  request to Meta or Google, and GA4 sets no cookies.
- The Conversions API receives events only when the visitor granted `marketing` consent, and only when
  `metaCapiEnabled` is on. Events without consent are not sent to Meta, even from the server.
- Consent is stored in the cookie `consent` with the value `v1.m1` (granted) or `v1.m0` (denied). The cookie is
  readable by the server so that it can decide without a round trip. The footer link "Privacy settings" lets the
  visitor change the choice.
- The consent banner appears when `marketing.consentBannerMode` is `always`, or when `auto` and a marketing tool is
  enabled. Necessary cookies never need consent.
- Hashed personal data (SHA-256 of the normalized email and phone) is sent to Meta only with consent, and only in
  Conversions API events. The purchase event carries the buyer's email and phone when the buyer granted `marketing` at
  checkout. The job that carries it holds them unhashed (the sink hashes just before sending, with the store's default
  country code for the phone), so if the send fails they sit in the failed-jobs table, which only owners can read, until
  the job is resolved and purged (90 days). The other events carry no personal data.

## Google Analytics 4

Set `marketing.ga4MeasurementId` (`G-…`, Settings > Marketing). Empty means GA4 is off. It runs under the same `marketing`
consent as the Pixel: one banner, one choice.

**In the browser** (`ui/lib/ga4.ts`, called by `track()` next to the Pixel): `page_view`, `view_item`, `add_to_cart`,
`begin_checkout` and `purchase`. The event names are GA4's recommended names. Value is sent in major units, as to the Pixel.

- `begin_checkout` fires once per load of the checkout page that has cart lines.
- `purchase` fires from the order page, only while the order is paid (`paid`, `processing`, `shipped`, `delivered`) and was
  paid in the last 48 hours. The page renders the order's facts in a `data-purchase` attribute and the browser sends them
  once per order (it remembers in `localStorage`). A page that loads before the payment is confirmed (the provider's
  webhook can arrive after the shopper returns) sends nothing; a later visit does. `transaction_id` is the order id, and the
  Meta event id is `purchase-<order id>`, the same one the Conversions API uses, so each platform counts the sale once.

**From the server** (the job `marketing.ga4_purchase`, Measurement Protocol): when a payment is confirmed (webhook, capture
or the owner marking the order paid), `ReportPurchase` queues the purchase for GA4. This covers bank transfer, cash on
delivery and WhatsApp orders, which the browser can never report, and shoppers who closed the tab or use an ad blocker. It
needs, all three:

1. the order's buyer granted `marketing` at checkout (`orders.marketing_consent`),
2. the order has a GA client id (`orders.ga_client_id`, read from the `_ga` cookie at checkout; the session id comes from
   `_ga_<id>`). Both are stored only with consent, and are NULL otherwise. A buyer who accepted marketing after reaching
   checkout has no client id, and is left to the browser's event,
3. the secret `GA4_API_SECRET` is set. Without it the job is skipped and logged (`ga4_purchase.skipped`).

The browser's purchase and the server's carry the same `transaction_id`. GA4 counts a transaction id once, so the two are
one sale. After the first live order, check in GA4 DebugView / the purchases report that it was counted once.

Get the secret in GA4: Admin > Data streams > the web stream > Measurement Protocol API secrets > Create. Copy the value into
`.secrets/<slug>.json` as `GA4_API_SECRET`. Google answers 2xx even for a body it does not understand, so a purchase that
never shows up is a data problem, not an HTTP error: use GA4's validation server while testing. `GA4_MP_BASE_URL` points the
sink at a test double in local runs.

## Product catalog feed

`GET /feeds/products.xml?locale=es|en` returns an RSS 2.0 document with the Google `g:` namespace, valid for Meta
Commerce Manager and Google Merchant Center. One item per active variant. Items without an image are left out,
because both platforms reject items without `g:image_link`. The response is cached with
`Cache-Control: public, s-maxage=3600`. When `marketing.feedEnabled` is false, or the locale is not supported, the
route answers 404 with no body.

## Settings used

`marketing`: `metaPixelId`, `metaCapiEnabled`, `metaTestEventCode`, `ga4MeasurementId`, `feedEnabled`, `feedBrand` (falls back to the store
name when empty), `feedColorAttribute`, `feedSizeAttribute`, `consentBannerMode`.
