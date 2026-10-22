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
| `view_item`      | A product page is served                          | one item (the product and the variant shown) |
| `add_to_cart`    | A product is added to the cart                    | items, value = price times quantity          |
| `begin_checkout` | The checkout page is opened with a non-empty cart | items, value = cart total                    |
| `purchase`       | The payment is confirmed on the server            | items, value = order total, `orderId`        |

`page_view` and `view_item` are written by the server. `add_to_cart` and `begin_checkout` come from the browser
(`POST /api/events`). `purchase` is written by the server when the payment is confirmed, never from the browser.

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
- Meta is the only third party. The Meta Pixel script is injected, and `fbq` calls are made, only after the visitor
  grants the `marketing` category. Without consent, the browser makes no request to Meta.
- The Conversions API receives events only when the visitor granted `marketing` consent, and only when
  `metaCapiEnabled` is on. Events without consent are not sent to Meta, even from the server.
- Consent is stored in the cookie `consent` with the value `v1.m1` (granted) or `v1.m0` (denied). The cookie is
  readable by the server so that it can decide without a round trip. The footer link "Privacy settings" lets the
  visitor change the choice.
- The consent banner appears when `marketing.consentBannerMode` is `always`, or when `auto` and a marketing tool is
  enabled. Necessary cookies never need consent.
- Hashed personal data (SHA-256 of the normalized email and phone) is sent to Meta only with consent, and only in
  Conversions API events.

## Product catalog feed

`GET /feeds/products.xml?locale=es|en` returns an RSS 2.0 document with the Google `g:` namespace, valid for Meta
Commerce Manager and Google Merchant Center. One item per active variant. Items without an image are left out,
because both platforms reject items without `g:image_link`. The response is cached with
`Cache-Control: public, s-maxage=3600`. When `marketing.feedEnabled` is false, or the locale is not supported, the
route answers 404 with no body.

## Settings used

`marketing`: `metaPixelId`, `metaCapiEnabled`, `metaTestEventCode`, `feedEnabled`, `feedBrand` (falls back to the store
name when empty), `feedColorAttribute`, `feedSizeAttribute`, `consentBannerMode`.
