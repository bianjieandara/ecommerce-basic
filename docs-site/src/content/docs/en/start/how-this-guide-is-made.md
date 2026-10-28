---
title: How this guide is made
description: Where the screenshots come from and how to refresh them.
sidebar:
  # An internal note for the team, not for the client: out of the nav and out of search. The page still exists at its URL.
  order: 2
  hidden: true
pagefind: false
---

The pages are Markdown files in `docs-site/src/content/docs/`, shown by [Starlight](https://starlight.astro.build). The
screenshots are **not** taken by hand: a script opens the real store in a headless Chrome and saves each screen, so they match
the product and can be refreshed in minutes after a change.

## Refreshing the screenshots

You need Node and Google Chrome on the machine. From the repository root:

```sh
npm run build                      # the store as it will be deployed
npm run docs:store                 # starts a demo store on http://localhost:4400 with its own empty database
npm run docs:data                  # fills it with sample products, pictures, orders and testimonials
npm run docs:screens               # takes every screenshot in Spanish into docs-site/src/assets/screens/es/
DOCS_LANG=en npm run docs:screens  # the same screenshots with the interface in English (folder en/)
```

`npm run docs:screens -- admin-orders` takes only the screenshots whose name starts with `admin-orders`.

The demo store keeps its data in `.wrangler/docs-state/`, separate from the development database, so nothing you do for the
guide touches real data. The sample owner account is created by the script and its login is saved in
`.wrangler/docs-admin.json`, which is never committed.

## Previewing and publishing the guide

```sh
npm run docs:dev                   # http://localhost:4500 with live reload
npm run docs:build                 # static site in docs-site/dist/
```

The output is plain static files. They can be hosted on Cloudflare Workers static assets or Pages, or on any web host.

## Languages

Spanish is the main language and is served at the root of the site; English is under `/en/`. Each language has its own folder
of screenshots, so the interface you see matches the language of the text.
