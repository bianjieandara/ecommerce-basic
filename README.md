# eBAQ ecommerce basic

A multi-client online store template for Cloudflare Workers. One codebase, many stores: every client gets its own Worker, domain,
database, media bucket, job queue and analytics, so one client's data and outages never touch another's.

Live demo: <https://ecommerce.relion-app.com/en/>

## What is in the box

**Storefront** (Spanish and English, mobile first)

- Catalog with filters and search, product variants, gallery, reviews and stock alerts.
- Cart, checkout and card payments through dLocal Go and PayPal; order tracking and PDF invoices.
- Content pages built in the admin, a contact page (WhatsApp first, email, phone, map, social links), SEO (sitemap, structured data, product feeds).

**Admin**

- Products, categories, attributes and media; inventory with a stock ledger.
- Orders, invoices, refunds, shipping, testimonials, reports, dashboard and background-job monitor.
- Page builder, settings, email templates, users and roles.
- A "Get your store ready" checklist on the dashboard until the store name, logo, a product, a shipping method, a way to pay and
  the legal pages are done. A new store starts with pickup, a standard shipping method switched off, and cash on delivery.

**Platform**

- Hexagonal architecture with the layer rules enforced by ESLint ([docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)).
- Slow or external work (emails, PDFs, invoices, alerts) runs as a queued job with retries and a dead-letter queue.
- Security headers (A+ on securityheaders.com), rate limits and Turnstile on public endpoints ([docs/SECURITY.md](./docs/SECURITY.md)).
- Webhooks (dLocal Go, PayPal, WhatsApp) are signature-checked, rate limited and size-capped before anything else runs.
- Demo mode for a public showcase: a shared login, a nightly reset, outbox e-mails and sandbox payments
  ([The demo store](#the-demo-store)). It is off for every client except `demo`.

### Status

Stages 0 to 17 and 20 to 24 are done. Still open: WhatsApp Cloud API adapter (18), tracking, consent and Meta marketing (19) and
the multi-client provisioning polish (25). See [docs/PROGRESS.md](./docs/PROGRESS.md).

## Stack

| Area      | Technology                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| Runtime   | Astro 7 in server mode on Cloudflare Workers, custom entrypoint `src/worker.ts` (fetch, queue and cron handlers). |
| UI        | Preact 11 islands, Tailwind CSS v4, nanostores, zod v4, TypeScript (strict).                                      |
| Data      | Cloudflare D1 (database), KV (cache), R2 (media).                                                                 |
| Jobs      | Cloudflare Queues with a dead-letter queue, plus a cron trigger.                                                  |
| Platform  | Email Service, Browser Rendering (PDFs), Analytics Engine, Turnstile, Workers AI (optional helpers).              |
| Payments  | dLocal Go and PayPal.                                                                                             |
| Messaging | Cloudflare Email Service and the WhatsApp Cloud API.                                                              |

## Quick start

You need Node 22.23.4 or newer and a Cloudflare account (the dev server uses remote Browser Rendering and Analytics).

```sh
npm install
cp .dev.vars.example .dev.vars   # local secrets, gitignored
npx wrangler login
npm run db:migrate:local
npm run db:seed:local            # optional sample data
npm run dev                      # http://localhost:4321
```

`npm run dev` first runs `scripts/use-client.mjs`, which writes the root `wrangler.jsonc` for `CLIENT_SLUG` (default `demo`).
`astro dev` connects to Cloudflare when it starts. That is expected.

Before every commit run `npm run check` (types, ESLint, Prettier). Before a release also run `npm run build`.

## Repository layout

Counts are files tracked by git (810 files in 177 folders in total).

```
src/              607 files   the store itself
  domain/          30         pure business rules, no framework imports
  application/    175         use cases and ports
  infrastructure/  78         D1, KV, R2, Queues, payments, email adapters
  http/            20         endpoint helpers and request handling
  composition/      9         wires adapters into use cases, one file per module
  pages/          121         Astro routes: storefront, admin, API, feeds
  ui/             171         components, islands, styles, i18n
db/                 4         D1 migrations and seed data
clients/            3         one folder per client (config and extensions)
scripts/           14         client provisioning, deploy and docs tooling
docs/              10         architecture, runbooks, decisions, plan
docs-site/        152         separate Starlight site: the user guide
public/             3         static assets
```

## Scripts

| Script                                        | What it does                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                 | Local dev server (writes `wrangler.jsonc` for the active client first).                                                                 |
| `npm run build`                               | Production build into `dist/` (same client step).                                                                                       |
| `npm run preview`                             | Serves the build locally.                                                                                                               |
| `npm run check`                               | `astro check`, ESLint and Prettier check. Run before every commit.                                                                      |
| `npm run format` / `npm run lint`             | Prettier write, ESLint.                                                                                                                 |
| `npm run cf-typegen`                          | Regenerates `worker-configuration.d.ts` (generated, do not edit).                                                                       |
| `npm run db:migrate:local`                    | Applies `db/migrations/` to the local D1 database.                                                                                      |
| `npm run db:seed:local`                       | Loads `db/seed/dev.sql` into the local database.                                                                                        |
| `npm run client:new -- <slug>`                | Provisions a client's resources and writes `clients/<slug>/client.jsonc`. Add `--account-id <id>` for a client with its own account.    |
| `npm run client:secrets -- <slug>`            | Uploads `.secrets/<slug>.json` to the client's Worker.                                                                                  |
| `npm run deploy:client -- <slug> [--dry-run]` | Builds, creates missing queues, applies remote D1 migrations and deploys one client.                                                    |
| `npm run deploy:all [-- --dry-run]`           | Deploys every client in `clients/` in turn and prints a summary. Exits 1 if any failed.                                                 |
| `npm run docs:dev` / `npm run docs:build`     | Runs or builds the user guide in `docs-site/` (port 4500).                                                                              |
| `node scripts/docs/store.mjs [--demo]`        | Runs the production build as a local store on port 4400 with its own database (`.wrangler/docs-state`). `--demo` adds test demo values. |
| `npm run docs:data`                           | Fills that local store with the sample content: pictures, the home page, the theme, orders and testimonials.                            |
| `npm run demo:snapshot`                       | Freezes the local store into `clients/demo/snapshot/snapshot.json` (tables listed in `scripts/demo/snapshot.mjs`).                      |
| `npm run demo:publish [-- --local]`           | Copies the snapshot and its images to the demo bucket (`--local` writes into the local store instead).                                  |
| `npm run test:all`                            | Every test file against the local store on port 4400, about 25 minutes. Some tests change the store, so restock or reseed first.        |
| `npm run test:demo`                           | Demo mode against a store started with `--demo`: notices, locks, outbox, reset and the deploy guard (34 checks).                        |

## Adding and updating clients

1. `npm run client:new -- <slug>`: creates the client's resources and `clients/<slug>/client.jsonc`.
2. Edit `client.jsonc` (domain, sender, payment mode, Turnstile key) and create `.secrets/<slug>.json`.
3. `npm run client:secrets -- <slug>`, then `npm run deploy:client -- <slug>`.
4. Open `/admin/setup` once and change `SETUP_TOKEN`.
5. To update every client: `git pull` and `npm run deploy:all`.

Per-client behavior that differs from the template lives in `clients/<slug>/extensions/`, so the core stays shared.

Secrets (`.secrets/`, `.dev.vars`) and generated files (`wrangler.jsonc`, `worker-configuration.d.ts`, `.astro/`) are gitignored
and never committed. [docs/NEW_CLIENT.md](./docs/NEW_CLIENT.md) has the full checklist.

## The demo store

The public demo at <https://ecommerce.relion-app.com/en/> runs in demo mode, so anyone can try the admin panel.

|          |                                                |
| -------- | ---------------------------------------------- |
| Admin    | <https://ecommerce.relion-app.com/admin/login> |
| Email    | `demo@ecommerce.relion-app.com`                |
| Password | `demo-tienda-2026`                             |

These credentials are public by design (the login page shows them), so never reuse them for anything else.

What demo mode does:

- One shared login. It cannot manage users or passwords or issue refunds (`DEMO_LOCKED`); everything else is open.
- A nightly reset restores the store from `clients/demo/snapshot/snapshot.json`, so whatever visitors change is undone.
- E-mails are kept in an outbox instead of being sent, and payments stay in sandbox.
- The cookie banner is always shown (`consentBannerMode: always`), although the demo has no Pixel or GA4, so visitors can see the consent
  choice the template offers. It sets only the consent cookie and sends nothing to anyone.

The settings live in `vars` of `clients/demo/client.jsonc` (`DEMO_MODE`, `DEMO_LOGIN_EMAIL`, `DEMO_LOGIN_PASSWORD`). `npm run deploy:client -- demo`
refuses to run in demo mode without a login of at least 12 characters, and no client other than `demo` may turn demo mode on.
To change the login, edit those two values and deploy again.

**What a visitor sees.** A notice above the storefront header says nothing is charged. Checkout shows the dLocal Go test card and,
when `DEMO_PAYPAL_BUYER_*` is set, a PayPal sandbox buyer. The order page lists the e-mails that order produced, and each one
opens with the order's access key. The admin shows a "Demo" pill, a guide link and a "Try this" card with six guided tasks.

**What the nightly reset does.** After 03:00 in the store's time zone, once a day, the job `demo.reset` (see
`src/application/demo/reset-demo.ts`) does four things: it deletes visitors' images and the e-mails in the outbox, empties the
snapshot tables and the logs, writes the snapshot back with its times moved forward (so the dashboard always shows recent
orders), and rewrites the shared account with a fresh password hash. Owner accounts and their sessions are never touched. An owner
can run the same reset from the dashboard at any time.

**The demo content is a snapshot, not live data.** `clients/demo/snapshot/snapshot.json` holds the sample catalog, pictures, home
page, theme, orders and testimonials. It is produced from a clean local demo store and published to the demo's R2 bucket:

```sh
rm -rf .wrangler/demo-build                                   # start from an empty database
DOCS_STATE=.wrangler/demo-build node scripts/docs/store.mjs --demo &   # migrations and dev seed, port 4400
DOCS_STATE=.wrangler/demo-build npm run docs:data              # the sample content (through the admin API)
DOCS_STATE=.wrangler/demo-build npm run demo:snapshot          # writes clients/demo/snapshot/snapshot.json
DOCS_STATE=.wrangler/demo-build npm run demo:publish           # copies the images and the snapshot to the demo bucket
```

Commit the new `snapshot.json` after it changes, and check the file holds no test data first (real addresses, leftover test
orders). The reset uses whatever snapshot is published, so the snapshot must be republished after content changes.

**Publishing.** `npm run demo:publish` reads every image of the snapshot from the local store in `DOCS_STATE`, which must be the
store the snapshot was taken from, and uploads them to the bucket before the snapshot. It reads and checks all of them first and
stops, uploading nothing, if one is missing or empty: an earlier version uploaded the empty file a failed read leaves behind and
replaced images in the live bucket with empty objects. When only settings or text changed and the images are already in the bucket,
publish the file alone:

```sh
npm run demo:publish -- --snapshot-only    # checks over HTTP that every image is live and not empty, then uploads only the snapshot
```

`demo:snapshot` also refuses to write a snapshot whose marketing settings do not keep the cookie banner always on (see above), so
take it from a store that `docs:data` has filled. Never point `demo:snapshot` or the tests at the committed file: a snapshot
made by a test is test data (`test:demo` writes to a private path for that reason).

**Things to know before relying on the live demo.** The live Worker runs the code it was last deployed with. A new deployment
is needed before the reset, the locks and the outbox run there; publishing the snapshot alone does not change the live site.
The outbox is a demo-only sender (`EMAIL_TRANSPORT=outbox`); on a local store `.dev.vars` sets `EMAIL_TRANSPORT=console`, which
overrides the build, so `scripts/docs/store.mjs --demo` passes `outbox` explicitly.

**Running a demo locally.** `npm run build`, then `node scripts/docs/store.mjs --demo` (leave it running), then
`npm run test:demo` in another terminal. The test publishes a snapshot into the local bucket and checks the notices, the locks,
the outbox, the reset and the deploy guard.

## Documentation

| Document                                                     | Read it for                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| [docs/NEW_CLIENT.md](./docs/NEW_CLIENT.md)                   | Runbook for a new client, from provisioning to first login.        |
| [docs/CUSTOMIZATION.md](./docs/CUSTOMIZATION.md)             | Admin settings, client extensions, new adapters, updating clients. |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)               | Layers, dependency rules and the main design rules.                |
| [docs/JOBS.md](./docs/JOBS.md)                               | Background jobs, retries and the dead-letter queue.                |
| [docs/SECURITY.md](./docs/SECURITY.md)                       | Threats, protections and the checklist for new endpoints.          |
| [docs/WHATSAPP.md](./docs/WHATSAPP.md)                       | Meta Cloud API setup and template approval.                        |
| [docs/ANALYTICS.md](./docs/ANALYTICS.md)                     | Event shape, consent rules, Meta and GA4 conversion events.        |
| [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) | The full plan, stage by stage.                                     |
| [docs/DECISIONS.md](./docs/DECISIONS.md)                     | Decision log.                                                      |
| [docs/PROGRESS.md](./docs/PROGRESS.md)                       | Stage status.                                                      |

The end-user guide for store owners is a separate site in [docs-site/](./docs-site), run with `npm run docs:dev`.

## Conventions

- Everything is in English: code, comments and docs. User-visible text comes from `src/ui/i18n`.
- Money is integer minor units (`*_minor`); tax rates are basis points. Never floats.
- Pages change data only through use cases; every stock change goes through the inventory ledger.
- Keep files under about 250 lines and search `src/` before adding a helper.
