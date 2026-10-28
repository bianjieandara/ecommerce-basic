// @ts-check
// Starlight site for the user guide. Spanish is the main language (served at the root), English lives under /en/. Store-owner
// pages (admin/ and clients/) are grouped in the sidebar by the stage of running a store they serve (data/guide-stages.ts),
// the same grouping the home page uses, so the two never drift apart. Screenshots are in docs-site/src/assets/screens/<lang>/
// and are taken by scripts/docs/screenshots.mjs.
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { regionBootstrapScript } from './src/data/regions.mjs';
import { STAGES } from './src/data/guide-stages';

export default defineConfig({
  site: 'https://docs.e-baq.com',
  integrations: [
    starlight({
      title: { es: 'Guía de la tienda', en: 'Store guide' },
      description:
        'Cómo funciona la tienda para quien compra, cómo la gestiona su equipo desde el panel y cómo un cliente consigue y lanza una.',
      // The right "On this page" column is gone everywhere, not only on the stage pages, so every page gains that reading width.
      tableOfContents: false,
      customCss: [
        './src/styles/guide.css',
        './src/styles/guide-content.css',
        './src/styles/guide-shots.css',
        './src/styles/guide-home.css',
        './src/styles/guide-motion.css',
        './src/styles/guide-region.css',
        './src/styles/guide-blocks.css',
      ],
      head: [
        // Picks the visitor's country (saved choice, then time zone) before the first paint, so pages never flash the wrong prices.
        { tag: 'script', content: regionBootstrapScript() },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true } },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
          },
        },
      ],
      defaultLocale: 'root',
      locales: {
        root: { label: 'Español', lang: 'es' },
        en: { label: 'English', lang: 'en' },
      },
      sidebar: [
        {
          label: 'Empieza aquí',
          translations: { en: 'Start here' },
          items: [{ autogenerate: { directory: 'start' } }],
        },
        {
          label: 'Lo que ve quien compra',
          translations: { en: 'What shoppers see' },
          items: [{ autogenerate: { directory: 'storefront' } }],
        },
        ...STAGES.map((stage) => ({
          label: stage.title.es,
          translations: { en: stage.title.en },
          items: stage.pages.map(([slug]) => ({ slug })),
        })),
      ],
    }),
  ],
});
