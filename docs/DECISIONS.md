# Decisions log

Short ADR-style entries: date, decision, reason. Add an entry whenever a dependency is added,
an external API behaves differently from the plan, or a plan item is changed.

## 2026-10-21 — Stage 0

- **Astro 7 (latest stable)** instead of the Astro 5 pattern in older docs. Reason: plan says "latest stable".
- **Cloudflare adapter with `imageService: "passthrough"`**. Reason: we resize images in the browser, so no paid transforms.
- **Tailwind v4 through `@tailwindcss/vite`**. Reason: plan styling decision; no PostCSS config needed.
- **`@client` alias falls back to `clients/_default/extensions`** when the active client has no folder.
- **Layer boundary rule also blocks `ui`, `pages` and `clients` from importing `composition`**. Reason: the plan says UI never
  imports composition (section 2.1). The lint rule enforces it.
- **Pre-scripts (`predev`, `prebuild`) that call `scripts/use-client.mjs`** were added in Stage 1, once the script existed.
- **Stage 0 root route is a plain `ok` endpoint** (`src/pages/index.ts`). Replaced in Stage 7.
- **`@types/node` added as a dev dependency**. Reason: `astro.config.mjs` uses `node:fs` and `process.env`; without the types
  `astro check` fails. Type definitions only, no runtime code.

## 2026-10-21 — Stage 1

- **Custom Worker entrypoint is `src/worker.ts`**. It wraps `handle` from `@astrojs/cloudflare/handler` (adapter 14) and adds
  `queue` and `scheduled`. Reason: the adapter builds its own entry, and the default one has no queue or cron handlers.
  Importing `dist/` from `src/` was rejected: it breaks the type check and the build before the first `astro build`.
- **Compatibility date `2026-10-19`** instead of today's date. Reason: the local workerd binary supports up to 2026-10-19;
  a newer date stops `astro dev`.
- **`wrangler.base.jsonc` keeps placeholders**; `scripts/use-client.mjs` writes the root `wrangler.jsonc` (gitignored) for the active client.
- **Dev uses remote bindings** (Browser Run and Analytics SQL). `astro dev` connects to Cloudflare at startup; this is expected.
- **R2 bucket is pending.** The account does not have R2 enabled yet (Cloudflare error 10042). Enable R2 in the dashboard, then run
  `npx wrangler r2 bucket create demo-media`. `scripts/new-client.mjs` creates R2 last and prints this instruction if it fails.
- **Resource creation is idempotent.** D1 and KV are found by name before creating; queues treat "is already taken" as success.
- **`.dev.vars` is copied from `.dev.vars.example`** for local runs; it is gitignored.
- **`wrangler.base.jsonc` and `clients/*/client.jsonc` use trailing commas**, which Wrangler accepts.

## 2026-10-21 — Stage 2

- **Money, tax and totals are integer maths in the domain layer.** `computeLineTax` rounds half up with integers; `computeOrderTotals`
  is the one function used by quotes, checkout, gateways and invoices.
- **Catalog options are passed in, not read from settings.** `parseCatalogQuery` and `catalogQueryToSearchParams` take the currency
  exponent and default sort. The domain never reads settings, so the same function runs in pages, the count API and tests.
- **Dictionaries are typed against `en`.** `es.ts` uses `Dictionary = typeof en`, so a missing Spanish key fails `npm run check`.
- **Missing translation keys render as the key** (visible gap, no crash).
- **Intl formatting lives in `domain/shared/format.ts`** and the UI re-exports it. Verified: a USD price in `es-CO` renders as `US$ 12,50`.
- **Pages must send a charset.** The dev server sends `text/html` without `charset`. The Stage 6 base layout adds
  `<meta charset="utf-8">` and the server keeps UTF-8 output.
