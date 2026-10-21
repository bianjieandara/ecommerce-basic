// @ts-check
// Astro configuration: server rendering on Cloudflare Workers, Preact islands, Tailwind v4,
// and the `@client` alias that lets each client build add its own widgets and CSS.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

// The active client decides which extensions folder is aliased (see scripts/use-client.mjs).
const clientSlug = process.env.CLIENT_SLUG || 'demo';
const clientExtensionsDir = existsSync(new URL(`./clients/${clientSlug}/extensions`, import.meta.url))
  ? `./clients/${clientSlug}/extensions`
  : './clients/_default/extensions';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  // We serve our own resized images (see Stage 14), so Astro's image service stays off.
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [preact()],
  prefetch: { defaultStrategy: 'hover' },
  build: { inlineStylesheets: 'auto' },
  security: { checkOrigin: true },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@client': fileURLToPath(new URL(clientExtensionsDir, import.meta.url)),
      },
    },
  },
});
