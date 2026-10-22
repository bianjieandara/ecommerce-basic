# Customization

There are three levels, from the least to the most code. Start at the first one.

## 1. Admin (no code)

The store owner changes these in `/admin` from a phone or a laptop:

- **Settings** (`/admin/settings`): store details, tax, shipping, payments, notifications and the other setting groups.
- **Page builder** (`/admin/pages`): content pages and the layout of the home page.
- **Email templates** (`/admin/emails`): edit, preview and send a test of each template.
- **Users** (`/admin/users`): owners, staff and their roles.
- **Catalog, media, inventory, WhatsApp templates**: covered in the admin pages of their own stages.

Every client gets the same admin. Nothing in the admin is per client code.

## 2. Client extensions (`clients/<slug>/extensions`)

Use an extension for a client-specific widget or a stylesheet that should not reach other clients.

- The folder has `index.ts`, which exports `clientExtension` with three fields: `widgetDefinitions`, `widgetRenderers` and
  `stylesheet`. `clients/_default/extensions/index.ts` is the template; `scripts/new-client.mjs` copies it for each new client.
- The Astro config aliases `@client` to `clients/<CLIENT_SLUG>/extensions`, and to `clients/_default/extensions` when the client has
  no folder (`astro.config.mjs`). `CLIENT_SLUG` is set by the `use-client` step and by the `deploy:client` build.
- Extensions may import `domain`, `application` and `ui`. They may not import `infrastructure` or `composition`; ESLint rejects it
  (`eslint.config.js`, [ARCHITECTURE.md](./ARCHITECTURE.md)).

**Status:** the alias and the folders are in place, but no file under `src/` imports `@client` yet. An extension therefore has no
effect until the storefront merges `clientExtension` into its widgets and styles. Check this before promising a client a
custom widget.

## 3. Code: new adapters

Payment gateways, legal invoicing, and marketing sinks (for example TikTok or Google) are adapters. Add one like this:

1. Implement the port that already exists in `src/application/ports/` (`payments.ts`, `invoicing.ts`, `notifications.ts`,
   `analytics.ts` and so on). If the port does not fit, change the port first and record the change in `docs/DECISIONS.md`.
2. Put the adapter in `src/infrastructure/`. Keep money in integer minor units and tax in basis points.
3. Wire it in the matching `src/composition/` module (for example `ordering.ts`, `identity.ts`). `create-container.ts` only combines
   those modules. The plan mentions `create-app.ts`; the code uses `create-container.ts`.
4. Read the adapter's settings from environment variables or the client's secrets file. Add the names to `.dev.vars.example`.
5. Slow or external work runs as a job (`docs/JOBS.md`), never inside a request.
6. Run `npm run check` and `npm run build`.

Adapters that only one client needs still go through the ports, so the shared code stays the same for every client.

## Updating every client

1. Commit and push the change to the repository.
2. On the machine that deploys, `git pull`, then run `npm run deploy:all`.

`deploy:all` deploys every client in `clients/` in turn and applies any new migrations in `db/migrations/` to each client's D1
database. Each client keeps its own `client.jsonc`, secrets and resources, so an update does not change them. If one client fails,
the others still deploy; fix that client and run `npm run deploy:client -- <slug>` again.
