// @ts-check
// Starlight site for the user guide: English at the root, Spanish under /es (pages without a translation show the English
// text with a notice). The guide has two audiences, store owners who run the admin and clients who get a store, and the
// sidebar groups follow that.
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Store template guide',
      description:
        'How the store works for shoppers, how store owners run it from the admin, and how a client gets and launches one.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        es: { label: 'Español', lang: 'es' },
      },
      sidebar: [
        { label: 'Start here', items: [{ autogenerate: { directory: 'start' } }] },
        { label: 'What shoppers see', items: [{ autogenerate: { directory: 'storefront' } }] },
        { label: 'Running the store (admin)', items: [{ autogenerate: { directory: 'admin' } }] },
        { label: 'Getting a store (clients)', items: [{ autogenerate: { directory: 'clients' } }] },
      ],
    }),
  ],
});
