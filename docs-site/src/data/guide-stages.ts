// The stages of getting and running a store that "Por qué te conviene", "Gestionar la tienda" and "Conseguir una tienda" are
// regrouped into, for the home page
// and the sidebar (astro.config.mjs). Only slugs live here; each page's own title and description stay in its frontmatter, read
// at build time, so there is one place that owns them. A slug is the content id without its locale prefix (docsLoader strips
// `en/`), so the same list serves both languages. The thumbnail is presentation only and has no other source of truth.
export interface Stage {
  id: string;
  title: { es: string; en: string };
  blurb: { es: string; en: string };
  /** [slug, thumbnail screenshot name without extension][] */
  pages: [string, string][];
}

export const STAGES: Stage[] = [
  {
    id: 'por-que',
    title: { es: 'Por qué te conviene', en: 'Why it pays off' },
    blurb: {
      es: 'Qué gana tu negocio con una página propia y con vender en línea, con datos de México.',
      en: 'What your business gains from its own website and from selling online, with Mexican data.',
    },
    pages: [
      ['benefits', 'shop-home-phone'],
      ['benefits/own-website', 'shop-home-desktop'],
      ['benefits/selling-online', 'shop-product-desktop'],
      ['benefits/mexico-data', 'admin-reports'],
    ],
  },
  {
    id: 'decidir',
    title: { es: 'Decidir', en: 'Decide' },
    blurb: {
      es: 'Qué recibes, cuánto cuesta y cómo se ve por dentro.',
      en: 'What you get, what it costs and what it looks like inside.',
    },
    pages: [
      ['clients/what-you-get', 'shop-catalog-desktop'],
      // La demo va antes que los requisitos: tocar una tienda real convence más que leer lo que hay que aportar.
      ['clients/try-the-demo', 'shop-category-desktop'],
      ['clients/requirements-and-costs', 'admin-settings-general'],
    ],
  },
  {
    id: 'preparar',
    title: { es: 'Preparar', en: 'Set up' },
    blurb: {
      es: 'Carga tus productos y deja la tienda a tu gusto.',
      en: 'Load your products and make the store your own.',
    },
    pages: [
      ['admin/overview', 'admin-login'],
      ['clients/customize', 'admin-settings-theme'],
      ['admin/products', 'admin-products'],
      ['admin/catalog-setup', 'admin-media'],
      ['admin/pages-and-content', 'admin-page-builder'],
      ['admin/settings', 'admin-settings'],
      ['admin/emails-and-shipping', 'admin-shipping'],
    ],
  },
  {
    id: 'lanzar',
    title: { es: 'Lanzar', en: 'Launch' },
    blurb: {
      es: 'Prueba pagos y correos, y abre la tienda.',
      en: 'Test payments and emails, then open the store.',
    },
    pages: [
      ['clients/launch', 'admin-settings-checkout'],
      ['clients/test-accounts', 'shop-checkout-desktop'],
      ['admin/team-and-whatsapp', 'admin-users'],
    ],
  },
  {
    id: 'dia-a-dia',
    title: { es: 'Día a día', en: 'Day to day' },
    blurb: {
      es: 'Atiende pedidos, cuida el stock y mira cómo vas.',
      en: 'Handle orders, watch the stock and see how you are doing.',
    },
    pages: [
      ['admin/orders', 'admin-orders'],
      ['admin/inventory', 'admin-inventory'],
      ['admin/invoices', 'admin-invoices'],
      ['admin/messages-and-notifications', 'admin-emails'],
      ['admin/reports', 'admin-dashboard'],
      ['clients/operations', 'admin-jobs'],
      // Belongs here and not under "Decidir": it is for someone who already has a store and would rather not touch it.
      ['clients/changes-service', 'admin-settings'],
    ],
  },
];
