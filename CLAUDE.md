# Working rules for this repository

Before any task, read `docs/PROGRESS.md` (30 lines) and work in stage order. Then read only what the task needs:

- **The plan** (`docs/IMPLEMENTATION_PLAN.md`, about 26,000 tokens) is not read whole. Find your stage with `grep -n "^### Stage" docs/IMPLEMENTATION_PLAN.md` and read that section. Its conventions (sections 3 and 4) are already summarized below. Sections 5 and 6 (data model, contracts) describe the original design and can lag behind the code: when they differ from `src/` or `db/migrations/`, the code is right.
- **`docs/DECISIONS.md`** is a log, not a manual. Do not read it whole; `grep -n` it for the topic you are touching, and add an entry when you change or deviate from something.
- **`docs/ARCHITECTURE.md`** (35 lines) is worth reading once.

## Code rules

- Everything in English: code, identifiers, comments, docs. Each file starts with a 1–3 line header comment.
- Every exported symbol has a JSDoc comment. Comment the _why_.
- Respect the layer boundaries in `docs/ARCHITECTURE.md`. ESLint enforces them.
- No duplicated code. Search `src/` before adding a helper or component.
- Money: integer minor units (`*_minor`). Tax: basis points. Never floats for money.
- Strings in UI come from `src/ui/i18n`. Never hardcode user-visible text, including messages a use case returns for display (import rows, field errors): return a code and translate it in the UI.
- Mobile first (design at 360px). Touch targets ≥ 44px. Honor `prefers-reduced-motion`.
- Keep files under ~250 lines.
- Dependencies: only the approved list in the plan. New ones need a note in `docs/DECISIONS.md`.
- No automated tests for now. Verification is `npm run check`, `npm run build` and the stage smoke checks.

## Writes and side effects

- Take a write's result from the write itself: `RETURNING` in the same `db.batch`. Never re-read rows after a batch to work out what it changed; a concurrent request makes that read wrong.
- Once a write has committed, nothing after it may fail the request. Follow-up work (alert evaluation, notifications, enqueues) catches and logs its own errors, or runs as a job.
- An operation that commits several batches (imports, bulk actions) never throws half-way: it records each failed batch in its result and still runs its follow-ups for the batches that applied.
- Adapters enforce platform limits, so callers can pass any size. Queues `sendBatch` takes at most 100 messages and 256 KB; split with `chunk()` from `src/domain/shared/chunk.ts`.
- Every operation that changes stock hands the `StockChange[]` it gets back to `EvaluateStockChanges`.

## D1 queries

- No query inside a loop over rows. Pass lists as one JSON parameter (`IN (SELECT value FROM json_each(?))`), and send independent reads together in one `db.batch`.
- Paged lists find the page's ids first, computing only what the filter and sort need, then load that page's rows with the remaining joins and subqueries.
- Every `ORDER BY` used with `LIMIT`/`OFFSET` ends with a unique column (the id).
- Keep indexed columns bare in `WHERE`: compare ISO timestamps as ranges (`created_at >= ? AND created_at < ?`), never through `substr()` or `date()`. Check new list queries with `EXPLAIN QUERY PLAN`.
- Escape `%` and `_` in user text used with `LIKE`.
- Read each settings group once per operation and pass the value down.

## One source of truth

- Closed sets of values (reasons, statuses, modes) are `as const` arrays in `src/domain`; types, zod enums and filter lists derive from them.
- A business rule, such as turning a counted "set" into a delta, is one domain function that every use case calls.
- SQL used by more than one query (translated names, filter builders, full-text match) lives in one module under `src/infrastructure/d1/`. A helper that two adapters use moves there too.
- Use the helpers in `src/infrastructure/d1/d1-client.ts` (`isCheckViolation`, `isUniqueViolation`, `queryAll`, `statement`) instead of rewriting them.
- Moving a helper is one step: update every import, delete the old copy, then run `npm run check`.

## Coupling

- Pages change data only through use cases. The container never exposes a repository whose writes need a use case's checks or side effects (stock, orders).
- New modules wire themselves in their own `src/composition/<module>.ts`, as `admin-catalog.ts` and `inventory.ts` do; `create-container.ts` only combines them.

## Process rules

- After every numbered step: `npm run check`. Fix errors before moving on.
- End of stage: `npm run check && npm run build`, tick `docs/PROGRESS.md`, commit `feat(stage-N): <summary>`, push.
- Never commit secrets. Never edit generated files (`wrangler.jsonc`, `worker-configuration.d.ts`, `.astro/`).
- Ask the user for anything that needs their accounts (Cloudflare login, dLocal Go, PayPal, Meta, domains).
