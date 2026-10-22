# eBAQ ecommerce basic

A multi-client online store template. Every client is a separate Cloudflare Worker with its own domain, data, admin, queue and
analytics, all built from one codebase.

## Overview

- Storefront: catalog with filters, product variants, cart, checkout, invoices, content pages, reviews, WhatsApp and Meta
  marketing (per client, optional), in Spanish and English.
- Admin: products, media, inventory with a stock ledger, orders, invoices, messages, reports, page builder, settings, email
  templates, users and background jobs.
- Architecture: hexagonal (domain, application, infrastructure, HTTP, composition, UI). The layer rules are enforced by ESLint.
  See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Stack

- Astro 7 in server mode on Cloudflare Workers, with a custom entrypoint (`src/worker.ts`) that adds queue and cron handlers.
- Preact islands, Tailwind CSS v4, nanostores, zod v4, TypeScript (strict).
- Cloudflare D1 (database), KV (cache), R2 (media), Queues (background jobs with a dead-letter queue), Email Service, Browser
  Rendering (PDFs), Analytics Engine, Turnstile.
- Payments: dLocal Go and PayPal. Messaging: Cloudflare Email Service, WhatsApp Cloud API.

## Local setup

Requirements: Node 22.23.4 or newer, and a Cloudflare login for the remote bindings.

```sh
npm install
cp .dev.vars.example .dev.vars   # local secrets, gitignored
npx wrangler login
npm run db:migrate:local
npm run db:seed:local            # optional sample data
npm run dev                      # http://localhost:4321
```

`npm run dev` first runs `scripts/use-client.mjs`, which writes the root `wrangler.jsonc` for `CLIENT_SLUG` (default `demo`).
Development uses remote Browser Rendering and Analytics SQL, so `astro dev` connects to Cloudflare when it starts. That is expected.

## Scripts

| Script                                        | What it does                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                                 | Local dev server (writes `wrangler.jsonc` for the active client first).                                                              |
| `npm run build`                               | Production build into `dist/` (same client step).                                                                                    |
| `npm run preview`                             | Serves the build locally.                                                                                                            |
| `npm run check`                               | `astro check`, ESLint and Prettier check. Run before every commit.                                                                   |
| `npm run format` / `npm run lint`             | Prettier write, ESLint.                                                                                                              |
| `npm run cf-typegen`                          | Regenerates `worker-configuration.d.ts` (generated, do not edit).                                                                    |
| `npm run db:migrate:local`                    | Applies `db/migrations/` to the local D1 database.                                                                                   |
| `npm run db:seed:local`                       | Loads `db/seed/dev.sql` into the local database.                                                                                     |
| `npm run client:new -- <slug>`                | Provisions a client's resources and writes `clients/<slug>/client.jsonc`. Add `--account-id <id>` for a client with its own account. |
| `npm run client:secrets -- <slug>`            | Uploads `.secrets/<slug>.json` to the client's Worker.                                                                               |
| `npm run deploy:client -- <slug> [--dry-run]` | Builds, creates missing queues, applies remote D1 migrations and deploys one client.                                                 |
| `npm run deploy:all [-- --dry-run]`           | Deploys every client in `clients/` in turn and prints a summary. Exits 1 if any failed.                                              |

## Multi-client workflow

1. `npm run client:new -- <slug>`: resources and `clients/<slug>/client.jsonc`.
2. Edit `client.jsonc` (domain, sender, payment mode, Turnstile key) and create `.secrets/<slug>.json`.
3. `npm run client:secrets -- <slug>` and `npm run deploy:client -- <slug>`.
4. Open `/admin/setup` once and change `SETUP_TOKEN`.
5. To update all clients: `git pull` and `npm run deploy:all`.

Secrets (`.secrets/`, `.dev.vars`) and generated files (`wrangler.jsonc`, `worker-configuration.d.ts`, `.astro/`) are gitignored
and never committed. Every client's data and admin are separate; see the runbook for the full checklist.

## Docs

- [docs/NEW_CLIENT.md](./docs/NEW_CLIENT.md): runbook for a new client, from provisioning to the first login, and capacity limits.
- [docs/CUSTOMIZATION.md](./docs/CUSTOMIZATION.md): admin settings, client extensions, new adapters, and how to update clients.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md): layers, dependency rules, and the main design rules.
- [docs/JOBS.md](./docs/JOBS.md): background jobs, retries and the dead-letter queue.
- [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md): the full plan, stage by stage.
- [docs/DECISIONS.md](./docs/DECISIONS.md): decision log.
- [docs/PROGRESS.md](./docs/PROGRESS.md): stage status.
