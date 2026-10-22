# Security

What protects the store, where the code is, and a checklist to run before every new endpoint ships.

## Threats and what answers them

| Threat                                  | Answer                                                                                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bots posting forms, credential stuffing | Per-IP rate limit (`rateLimit` in `defineEndpoint`, Workers rate-limit bindings `RL_AUTH` 5/60 s, `RL_FORMS` 10/60 s, `RL_API` 60/10 s) before the body is read, then a Turnstile check in the use case.                                                           |
| Admin takeover                          | Session cookie `HttpOnly; SameSite=Lax; Secure` (https), session checked in `src/middleware.ts` for every `/admin` page and `/api/admin` endpoint, roles checked in the use cases, password hashing and login attempt limits in `application/identity`.            |
| Cross-site request forgery              | `SameSite=Lax` plus Astro `security.checkOrigin` (form-type posts from another origin answer 403); JSON bodies cannot be sent cross-site without a CORS preflight, which the Worker never allows.                                                                  |
| Clickjacking                            | `frame-ancestors 'none'` and `X-Frame-Options: DENY` on every response.                                                                                                                                                                                            |
| Forged payment notifications            | Webhooks verify the signature on the raw body (dLocal Go HMAC; PayPal through its verify API), then read the payment from the provider's API; `ConfirmPayment` ignores repeats.                                                                                    |
| Guessing someone's order or invoice     | Order and invoice URLs need the access key (256 bits). The key is stored as a hash and compared in constant time (`domain/shared/constant-time.ts`).                                                                                                               |
| Injection                               | Every query is parameterized; lists go in as one JSON parameter. Astro escapes output; Markdown renders through micromark with raw HTML and unsafe links disabled; theme CSS only takes validated hex colours and fixed font and radius maps; JSON-LD escapes `<`. |
| Spreadsheet formula injection           | `toCsv` prefixes a cell that starts with `=`, `+`, `-` or `@` (`application/documents/csv.ts`).                                                                                                                                                                    |
| Oversized requests                      | JSON 64 KB, forms and uploads 11 MB (a 10 MB image plus fields), CSV import 2 MB. The limit is enforced on the bytes received, not on the `Content-Length` header.                                                                                                 |
| Secrets in the repository               | Secrets live in `.dev.vars` (ignored) and Cloudflare secrets; `.dev.vars.example` holds names only.                                                                                                                                                                |

## Response headers

Set for every Worker response by `src/http/security-headers.ts` (called from the middleware) and, for static files that
never reach the Worker, by `public/_headers`. Keep the two in sync.

| Header                      | Value                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`, only over https                                   |
| `X-Content-Type-Options`    | `nosniff`                                                                                |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                        |
| `Permissions-Policy`        | `camera=(self), microphone=(), geolocation=()` (camera is for the admin barcode scanner) |
| `Content-Security-Policy`   | `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`                             |
| `X-Frame-Options`           | `DENY`                                                                                   |

There is no `script-src` yet. A script policy has to allow Turnstile, Cloudflare Web Analytics and Astro's inline
scripts (nonces or hashes), so it is a separate decision, recorded in `DECISIONS.md`.

## Endpoint checklist

Run through it for every new route.

1. **Who may call it?** Admin: the path is under `/api/admin/` (the middleware needs a session) and the use case checks the
   role when only some roles may do it. Public: say why in the file's header comment.
2. **Public mutation?** `rateLimit` on `defineEndpoint` and, for forms that create something or send email, the Turnstile
   check in the use case.
3. **Body?** Use `defineEndpoint` with a zod `input`, so the size limit and validation apply. Never call `request.json()`.
4. **Webhook?** Verify the signature on the raw body before parsing; answer an error status so the provider retries.
5. **Answers with a token or private data?** `Cache-Control: no-store` (`defineEndpoint` does it for JSON) and nothing in the URL
   that is a secret.
6. **Logs?** `logEvent` with ids and short codes, never tokens, keys, full emails or addresses.

### Current endpoints

| Endpoint                                                                    | Guard                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `POST /api/checkout`                                                        | rate limit `forms`, Turnstile                                            |
| `POST /api/contact`                                                         | rate limit `forms`, Turnstile                                            |
| `POST /api/stock-subscriptions`                                             | rate limit `forms`, Turnstile                                            |
| `POST /api/cart/quote`, `GET /api/catalog/count`, `GET /api/search/suggest` | rate limit `api`                                                         |
| `GET /api/health`                                                           | none; answers only `ok` and whether D1 responds                          |
| `GET /api/orders/[number]/invoice.pdf`                                      | access key, constant-time compare                                        |
| `POST /api/webhooks/dlocalgo`, `/api/webhooks/paypal`                       | signature on the raw body, then provider lookup                          |
| `POST /api/admin/login`                                                     | rate limit `auth` (scope `login`), Turnstile, attempt limit              |
| `POST /api/admin/password/forgot`                                           | rate limit `auth` (scope `forgot`), Turnstile, same answer for any email |
| `POST /api/admin/password/reset`                                            | rate limit `auth` (scope `reset`), single-use token                      |
| `POST /api/admin/setup`                                                     | rate limit `auth` (scope `setup`), setup token (constant-time)           |
| `POST /api/admin/logout`                                                    | open on purpose, so a stale cookie can be cleared                        |
| every other `/api/admin/**`                                                 | admin session in the middleware, role in the use case                    |

## Logs

`logEvent` (`src/infrastructure/system/logger.ts`, re-exported by `src/http/log.ts` for pages and routes) writes one JSON
line per event; Workers Logs is on (`observability.enabled`). Events to look for:

- `request.refused`: a sign-in, permission, rate-limit, bot-check or payment-provider refusal (`code`, `requestId`).
- `request.error`: an unexpected error (500).
- `webhook.accepted` and `webhook.rejected`: provider, request id, and whether a payment was applied.
- `paypal.capture_failed` and `dlocalgo.settle_failed`: the return page could not confirm the payment; the webhook settles it later.
- `job.*` and notification events from the job dispatcher and the notification service.
