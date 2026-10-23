// @ts-check
// Starlight site for the user guide. Spanish is the main language (served at the root), English lives under /en/. The guide has
// two audiences, store owners who run the admin and clients who get a store, and the sidebar groups follow that. Screenshots
// are in docs-site/src/assets/screens/<lang>/ and are taken by scripts/docs/screenshots.mjs.
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.relion-app.com',
  integrations: [
    starlight({
      title: { es: 'Guía de la tienda', en: 'Store guide' },
      description:
        'Cómo funciona la tienda para quien compra, cómo la gestiona su equipo desde el panel y cómo un cliente consigue y lanza una.',
      customCss: [
        './src/styles/guide.css',
        './src/styles/guide-content.css',
        './src/styles/guide-home.css',
        './src/styles/guide-motion.css',
      ],
      head: [
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
        {
          label: 'Gestionar la tienda (panel)',
          translations: { en: 'Running the store (admin)' },
          items: [{ autogenerate: { directory: 'admin' } }],
        },
        {
          label: 'Conseguir una tienda (clientes)',
          translations: { en: 'Getting a store (clients)' },
          items: [{ autogenerate: { directory: 'clients' } }],
        },
      ],
    }),
  ],
});
