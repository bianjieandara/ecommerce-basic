# Architecture

Hexagonal (ports and adapters) architecture on Cloudflare Workers. The full plan is in
[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

## Layers and the dependency rule

```
domain  <-  application  <-  infrastructure
                 ^                ^
               http  <-  composition (wires adapters into use cases)
                 ^
        pages (Astro routes)  ->  ui (components, islands, styles, i18n)
src/worker.ts (entrypoint): fetch -> Astro, queue -> job dispatcher, scheduled -> scheduler
```

| Layer             | Path                    | May import                                               | Must not import                                                                               |
| ----------------- | ----------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Domain            | `src/domain/`           | nothing outside `domain`                                 | application, infrastructure, http, ui, composition, Astro, Cloudflare, Preact, dLocal Go, zod |
| Application       | `src/application/`      | `domain`, `zod`, `micromark`                             | infrastructure, http, ui, composition, Astro, Cloudflare, Preact, dLocal Go                   |
| Infrastructure    | `src/infrastructure/`   | `domain`, `application`                                  | http, ui, composition                                                                         |
| HTTP              | `src/http/`             | `application`, `domain`, `composition` types             | ui                                                                                            |
| Composition       | `src/composition/`      | everything below it                                      | pages, ui                                                                                     |
| UI and pages      | `src/ui/`, `src/pages/` | `domain`, `application` (types/DTOs), `ui`, `locals.app` | infrastructure, composition                                                                   |
| Client extensions | `clients/**`            | `domain`, `application`, `ui`                            | infrastructure, composition                                                                   |

ESLint enforces these rules (`eslint.config.js`). A violation fails `npm run check`.

## Rules that keep the code small

- One implementation per concept. Before writing a helper, search `src/`.
- Money is integer minor units. Tax rates are basis points.
- Every stock change writes an inventory ledger row in the same D1 batch.
- Slow or external work (emails, WhatsApp, PDFs, Meta events, legal invoices, alerts) runs as a queued job, never inside a request.
- Admin lists share one filter model, and the storefront shares one catalog query parser.
- Public endpoints declare their limit with `defineEndpoint({ rateLimit })`; a hand-written `rateLimiter.allow` in an endpoint is a bug. Use cases that must rate limit for their own reasons (sign-in, password reset) key their own counters.
- Settings are read through the settings repository, which loads the whole table once per request (and shares it for 30 s in production). Read the groups you need from it; never cache settings anywhere else.
- Session work happens only for admin routes. Storefront code never reads `locals.admin`.
- Independent database reads go out together with `db.batch`; a loop that awaits one query per item is a defect.
