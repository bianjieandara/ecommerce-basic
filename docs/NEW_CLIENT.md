# New client runbook

Each client is one Worker with its own D1 database, R2 bucket, KV namespace, queues, cron trigger, rate-limit counters and
analytics dataset. All clients live in our Cloudflare account unless the client has an account of its own. The plan is in
[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) section 2.3.

## Before you start

- Log in once with `npx wrangler login` for our account. Enable R2 in the dashboard if it is not enabled yet.
- Pick a slug: `a-z`, `0-9` and dashes, 2 to 30 characters (for example `acme-shop`). The slug names the folder, the Worker
  (`<slug>-store`), the resources and the analytics dataset. It cannot change later.

## 1. Provision the resources

Our account:

```sh
npm run client:new -- acme-shop
```

The client's own account (billed to them):

1. Create `.secrets/acme-shop.env` (gitignored) with the client's Cloudflare API token:
   ```sh
   CLOUDFLARE_API_TOKEN=<token from the client's account>
   ```
2. Run `npm run client:new -- acme-shop --account-id <32-character account id>`.

The script creates the D1 database, the KV namespace, the queues `<slug>-jobs` and `<slug>-jobs-dlq`, and the R2 bucket. It
writes `clients/<slug>/client.jsonc` with the next free rate-limit base (1000, 1010, 1020, ...). Running it again is safe: resources
that exist are reused. If R2 is not enabled, the script says so; enable R2 and create the bucket with the command it prints.

## 2. Edit `clients/<slug>/client.jsonc`

- `vars.PUBLIC_SITE_URL`: the public address, for example `https://shop.example.com`.
- `vars.EMAIL_FROM`: a sender on the client's Email Service sending domain.
- `vars.PAYPAL_ENV` and `vars.DLOCALGO_ENV`: `sandbox` or `live`.
- `vars.TURNSTILE_SITE_KEY`: the site key of the client's Turnstile widget.
- `vars.WHATSAPP_PHONE_NUMBER_ID`, `vars.WHATSAPP_WABA_ID`, `vars.META_GRAPH_VERSION`: only when the client uses WhatsApp or Meta.
- `customDomains`: the hostnames that serve the store, for example `["shop.example.com"]`.
- `cron`: keep one expression per client (default every 15 minutes).

## 3. Domain, email, payments and messaging

These steps need the client's accounts or our accounts. Do each one in the Cloudflare or provider dashboard; the store only needs
the values they produce.

1. **Domain.** Either a zone in our account, or a subdomain of the client's domain. Add the hostname to `customDomains`.
2. **Turnstile.** Create a widget for the hostname. Put its site key in `TURNSTILE_SITE_KEY` (client.jsonc) and its secret key in
   `TURNSTILE_SECRET_KEY` (secrets file). Never keep Cloudflare's test keys (`1x000…`): any bot passes them. `deploy-client`
   refuses a test site key unless the client sets `"allowTestTurnstile": true`, which only the public demo does.
3. **Email Service.** Add the sending domain and use an address on it in `EMAIL_FROM`.
4. **Payments.** dLocal Go keys (`DLOCALGO_API_KEY`, `DLOCALGO_SECRET_KEY`) and PayPal keys (`PAYPAL_CLIENT_ID`,
   `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`). Register the webhooks at `<PUBLIC_SITE_URL>/api/webhooks/dlocalgo` and
   `<PUBLIC_SITE_URL>/api/webhooks/paypal`. Start with sandbox keys.
5. **WhatsApp (optional).** WhatsApp Business Account, phone number id, a permanent token (`WHATSAPP_TOKEN`), and a verify token
   (`WHATSAPP_VERIFY_TOKEN`). Register the webhook for the same host.
6. **Meta (optional).** Pixel and Conversions API token (`META_CAPI_TOKEN`), and the app secret (`META_APP_SECRET`).
7. **Google Analytics 4 (optional).** Create a GA4 property and a web data stream; its measurement ID (`G-…`) goes in
   Settings > Marketing. For purchases from the server (bank transfer, cash on delivery, WhatsApp), create a Measurement
   Protocol API secret (data stream > Measurement Protocol API secrets) and put it in `GA4_API_SECRET`. See
   [ANALYTICS.md](./ANALYTICS.md#google-analytics-4).

## 4. Secrets file

Create `.secrets/acme-shop.json` (gitignored). It is a flat object with the secrets from step 3, plus a long random
`SETUP_TOKEN` that protects the first owner setup:

```json
{
  "SETUP_TOKEN": "<long random string>",
  "TURNSTILE_SECRET_KEY": "...",
  "DLOCALGO_API_KEY": "...",
  "DLOCALGO_SECRET_KEY": "...",
  "PAYPAL_CLIENT_ID": "...",
  "PAYPAL_CLIENT_SECRET": "...",
  "PAYPAL_WEBHOOK_ID": "..."
}
```

Only include the keys the client uses. Empty values are rejected. `.dev.vars.example` lists every name.

## 5. Deploy

```sh
npm run deploy:client -- acme-shop --dry-run   # prints each command, runs nothing
npm run client:secrets -- acme-shop           # uploads .secrets/acme-shop.json to the Worker
npm run deploy:client -- acme-shop            # build, queues, remote D1 migrations, deploy
```

`deploy:client` writes the root `wrangler.jsonc` for the client, builds, creates the queues only if they are missing, applies the
remote D1 migrations and runs `wrangler deploy`. A failed step stops the run.

Order caveat: the plan lists the secrets upload before the first deploy. Wrangler's `secret bulk` needs the Worker to exist, and
this order has not been run against a real account yet. If `client:secrets` reports that the Worker is not found, run
`deploy:client` first, then `client:secrets`, then `deploy:client` again.

## 6. First login and setup

1. Open `<PUBLIC_SITE_URL>/admin/setup` and enter `SETUP_TOKEN`. The first owner is created once; the token works only for that.
   Setup also adds two starter shipping methods (`src/application/content/defaults/starter-content.ts`): "Store pickup", on and
   free, and "Standard shipping", off and unpriced, so checkout works and no guessed price is charged. Pages and settings are
   not written at setup: a page with no row shows its code default until the owner saves it, and settings use the zod
   defaults. The dashboard shows a "Get your store ready" checklist until the store name, logo, a published product, an active
   shipping method and the legal pages are done.
2. Change or remove `SETUP_TOKEN`: edit `.secrets/acme-shop.json`, then run `npm run client:secrets -- acme-shop`.
3. In the admin, set the store settings, upload the logo, add products, and (if used) submit and sync the WhatsApp templates.

## 7. Check the deploy

- The storefront loads on the client's hostname, in both `/es` and `/en`.
- `/admin` asks for a sign-in and the owner can sign in.
- A sandbox purchase reaches `paid`, and its order email is sent.
- The client's queue and analytics are its own: nothing from another client appears in its admin.

## 8. Updating clients

Pull the latest code and run `npm run deploy:all`. It deploys every client in `clients/` one after another, prints a summary table,
and exits with 1 if any client failed (the others still run). The secrets and resources of each client are not changed by a deploy.

## Own-account clients

Same commands. The difference is the `.secrets/<slug>.env` token and the `accountId` in `client.jsonc`. Their usage (Workers,
D1, R2, queues, emails, browser hours) is billed to their account, and the capacity limits below apply to each account
separately.

## Capacity

Limits from the plan (check the current Cloudflare limits before a large rollout):

| Resource              | Limit                | Note                                                                   |
| --------------------- | -------------------- | ---------------------------------------------------------------------- |
| Workers               | 500 per account      | One Worker per client.                                                 |
| KV namespaces         | 1,000 per account    | One per client.                                                        |
| Queues                | 10,000 per account   | Two per client (`<slug>-jobs` and its DLQ).                            |
| Cron triggers         | 250 per account      | One per client, so at most **250 clients with a cron** in one account. |
| Rate-limit namespaces | Three ids per client | `rateLimitNamespaceBase` allocates steps of 10 so ids never overlap.   |

Shared quotas that all clients in one account draw from: emails (Email Service), Browser Rendering hours (PDF invoices),
Queues operations, D1 and R2 storage and operations, and Analytics Engine writes. Watch them in the dashboard of the account
(Workers and Queues usage, D1 and R2 metrics, Email Service logs, Analytics Engine). When one account nears a quota, move the
largest clients to their own account with `--account-id`.
