// Fills the demo store's home page: a hero with three pictured slides, category tiles, featured products, a promo banner, the
// benefit row, customer opinions and a WhatsApp call to action. It saves through the admin API like the page builder does, so
// it shows the sections as an owner would set them up.
import { addHeroPictures } from './pictures.mjs';
import { post, sql } from './shared.mjs';

/** Text in both languages. */
const text = (es, en) => ({ es, en });

/** A button that goes to the shop; the page language is added to the link when it is shown. */
const shopButton = (es, en) => ({ href: '/shop', label: text(es, en) });

/**
 * Builds the home page's sections.
 * @param hero Media ids of the hero pictures.
 * @returns The sections, as the page builder saves them.
 */
function homeSections(hero) {
  const slides = [
    {
      image: hero[0],
      title: text('Nueva colección de temporada', 'The new season collection'),
      subtitle: text(
        'Camisetas, buzos y gorras de algodón que duran.',
        'Cotton tees, hoodies and caps made to last.',
      ),
      cta: shopButton('Ver la tienda', 'Shop now'),
    },
    {
      image: hero[1],
      title: text('Un hogar con más calma', 'A calmer home'),
      subtitle: text(
        'Velas, cojines y plantas para tu rincón favorito.',
        'Candles, cushions and plants for your favourite corner.',
      ),
      cta: shopButton('Descubrir el hogar', 'Explore home'),
    },
    {
      image: hero[2],
      title: text('Para llevar a todas partes', 'Made to carry along'),
      subtitle: text(
        'Botellas, bolsos y tazas que usarás cada día.',
        'Bottles, bags and mugs you will use every day.',
      ),
      cta: shopButton('Ver accesorios', 'See accessories'),
    },
  ];
  return [
    { id: 'home-hero', type: 'hero_carousel', enabled: true, config: { slides, autoplaySeconds: 7 } },
    {
      id: 'home-badges',
      type: 'trust_badges',
      enabled: true,
      config: {
        items: [
          { icon: 'truck', text: text('Envíos a todo el país', 'Shipping across the country') },
          { icon: 'return', text: text('Cambios en 10 días', 'Exchanges within 10 days') },
          { icon: 'lock', text: text('Pago seguro', 'Secure payment') },
          { icon: 'chat', text: text('Atención por WhatsApp', 'Support on WhatsApp') },
        ],
      },
    },
    {
      id: 'home-categories',
      type: 'category_grid',
      enabled: true,
      config: { title: text('Compra por categoría', 'Shop by category'), categoryIds: [] },
    },
    {
      id: 'home-featured',
      type: 'featured_products',
      enabled: true,
      config: {
        title: text('Los favoritos', 'Customer favourites'),
        source: 'featured',
        categoryIds: [],
        productIds: [],
        limit: 8,
        layout: 'grid',
      },
    },
    {
      id: 'home-promo',
      type: 'promo_banner',
      enabled: true,
      config: {
        image: hero[1],
        title: text('Envío gratis desde 50 USD', 'Free shipping from 50 USD'),
        text: text(
          'Compra hoy y recíbelo en casa sin costo de envío.',
          'Order today and get it delivered with no shipping cost.',
        ),
        cta: shopButton('Aprovechar', 'Start shopping'),
        align: 'left',
      },
    },
    {
      id: 'home-testimonials',
      type: 'testimonials',
      enabled: true,
      config: {
        title: text('Lo que dicen nuestros clientes', 'What our customers say'),
        includeGoogle: false,
        includeManual: true,
        limit: 3,
      },
    },
    {
      id: 'home-whatsapp',
      type: 'whatsapp_cta',
      enabled: true,
      config: {
        title: text('¿Tienes dudas?', 'Have questions?'),
        text: text('Escríbenos y te respondemos rápido.', 'Message us and we will reply quickly.'),
        buttonLabel: text('Escribir por WhatsApp', 'Chat on WhatsApp'),
      },
    },
  ];
}

/**
 * Sets up the home page, unless it already has a hero.
 * @param cookie Admin session.
 */
export async function addHomePage(cookie) {
  const page = sql("SELECT id, sections_json FROM pages WHERE slug = 'home'")[0];
  // A store that never saved its home page has no row yet; the system page is then addressed by its slug.
  if (page?.sections_json.includes('home-hero')) return;
  const hero = await addHeroPictures(cookie);
  const saved = await post(
    `/api/admin/pages/${page?.id ?? 'home'}`,
    {
      title: text('Inicio', 'Home'),
      seoTitle: text('', ''),
      seoDescription: text('', ''),
      isPublished: true,
      sections: homeSections(hero),
    },
    cookie,
  );
  if (!saved.json?.ok) throw new Error(`Could not save the home page: ${JSON.stringify(saved.json?.error)}`);
}

/**
 * Gives the demo store an editorial look: warm paper background, oxblood buttons, a serif for headings. A template starts
 * neutral; this is what an owner gets by choosing colours and the "Editorial" typeface in Settings > Theme.
 * @param cookie Admin session.
 */
export async function applyDemoTheme(cookie) {
  const response = await post(
    '/api/admin/settings/theme',
    {
      values: {
        colorPrimary: '#111111',
        colorOnPrimary: '#ffffff',
        colorAccent: '#cf3426',
        colorBackground: '#ffffff',
        colorSurface: '#f4f4f2',
        colorText: '#111111',
        fontPreset: 'volt',
        radius: 'md',
      },
    },
    cookie,
  );
  if (response.status !== 200) throw new Error(`Could not save the theme: ${JSON.stringify(response.json)}`);
}
