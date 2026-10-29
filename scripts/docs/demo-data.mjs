// Fills a LOCAL demo store with believable data for the guide's screenshots: an owner account, a picture for each seed
// product, orders in every state, invoices, contact messages and testimonials. It only talks to a store running on this
// machine (default http://localhost:4400, started by `npm run docs:store`) and never touches the real development database.
//
// Usage: node scripts/docs/demo-data.mjs
// Environment: DOCS_BASE (store URL), DOCS_STATE (wrangler persist folder, default .wrangler/docs-state), see shared.mjs.
import { loadVertical } from '../demo/seed-vertical.mjs';
import { addCategoryPictures, addProductPictures } from './pictures.mjs';
import { addHomePage, applyDemoCookieBanner, applyDemoTheme } from './home-content.mjs';
import { ownerCookie } from './owner-session.mjs';
import { post, sql, TURNSTILE_TEST_TOKEN } from './shared.mjs';

/** Where the shipped demo orders go, per country of the store. A demo in Mexico delivering to Bogotá reads as filler. */
const SHIPPING_ADDRESS = {
  CO: {
    line1: 'Calle 45 # 12-34',
    line2: 'Apto 301',
    city: 'Bogotá',
    region: 'Cundinamarca',
    postalCode: '110111',
    country: 'CO',
  },
  MX: {
    line1: 'Av. Insurgentes Sur 300',
    line2: 'Int. 4',
    city: 'Ciudad de México',
    region: 'CDMX',
    postalCode: '06700',
    country: 'MX',
  },
};

/** Shoppers who place the demo orders. */
const SHOPPERS = [
  ['Camila Torres', 'camila.torres@example.com', '+57 300 555 0101'],
  ['Andrés Gómez', 'andres.gomez@example.com', '+57 311 555 0102'],
  ['Laura Martínez', 'laura.martinez@example.com', '+57 312 555 0103'],
  ['Sofía Herrera', 'sofia.herrera@example.com', '+57 313 555 0104'],
  ['Daniel Pérez', 'daniel.perez@example.com', '+57 314 555 0105'],
  ['Valentina Cruz', 'valentina.cruz@example.com', '+57 315 555 0106'],
];

/**
 * Places the demo orders and moves them to different states, so the order list, the invoices and the dashboard have content.
 * @param cookie Admin session.
 */
async function addOrders(cookie) {
  const existing = sql('SELECT COUNT(*) AS n FROM orders')[0].n;
  // One variant per product, in a stable order, so the plans below can name a product by its place in the catalogue and
  // work for any store. Naming products by id only ever worked for the one catalogue the ids belonged to.
  const variants = sql(
    `SELECT v.id, v.product_id FROM product_variants v WHERE v.is_active = 1 AND v.stock > 0
       GROUP BY v.product_id ORDER BY v.product_id`,
  );
  const variantAt = (index) => variants[index]?.id;
  // The store's own country decides where the shipped orders go; an unknown one falls back to the original demo's.
  const country = JSON.parse(
    sql("SELECT value_json AS v FROM settings WHERE group_key = 'general'")[0].v,
  ).country;
  // A plan asks for a payment method, but not every store offers every one: Raiz has no cash on delivery. Checkout
  // refuses a method the store disabled, so an unavailable one falls back to the first the store does enable.
  const enabled = JSON.parse(
    sql("SELECT value_json AS v FROM settings WHERE group_key = 'checkout'")[0].v,
  ).enabledMethods;
  const methodFor = (wanted) => (enabled.includes(wanted) ? wanted : (enabled[0] ?? 'bank_transfer'));
  const plans = [
    {
      shopper: 0,
      items: [
        [0, 2],
        [5, 1],
      ],
      method: 'bank_transfer',
      ship: 'ship-pickup',
      steps: ['paid', 'processing', 'shipped', 'delivered'],
    },
    {
      shopper: 1,
      items: [[1, 1]],
      method: 'cash_on_delivery',
      ship: 'ship-flat',
      steps: ['paid', 'processing', 'shipped'],
    },
    {
      shopper: 2,
      items: [
        [2, 2],
        [7, 2],
      ],
      method: 'bank_transfer',
      ship: 'ship-flat',
      steps: ['paid', 'processing'],
    },
    { shopper: 3, items: [[8, 1]], method: 'whatsapp', ship: 'ship-pickup', steps: [] },
    { shopper: 4, items: [[3, 3]], method: 'bank_transfer', ship: 'ship-flat', steps: ['paid'] },
    {
      shopper: 5,
      items: [[9, 1]],
      method: 'bank_transfer',
      ship: 'ship-pickup',
      steps: ['cancelled'],
    },
  ];
  for (const plan of plans.slice(existing)) {
    const [name, email, phone] = SHOPPERS[plan.shopper];
    const placed = await post('/api/checkout', {
      locale: plan.shopper % 2 === 0 ? 'es' : 'en',
      items: plan.items.map(([index, quantity]) => ({ variantId: variantAt(index), quantity })),
      customer: { name, email, phone },
      whatsappOptIn: false,
      acceptedLegal: true,
      shippingMethodId: plan.ship,
      address: plan.ship === 'ship-flat' ? (SHIPPING_ADDRESS[country] ?? SHIPPING_ADDRESS.CO) : null,
      paymentMethod: methodFor(plan.method),
      note: '',
      attribution: {},
      turnstileToken: TURNSTILE_TEST_TOKEN,
    });
    if (!placed.json?.ok) throw new Error(`Order failed: ${JSON.stringify(placed.json?.error)}`);
    const number = Number(/orders\/(\d+)/.exec(placed.json.data.orderPath ?? '')?.[1]);
    for (const to of plan.steps) {
      const moved = await post(
        `/api/admin/orders/${number}/status`,
        { to, notify: false, trackingCode: to === 'shipped' ? 'CO123456789' : '', note: '' },
        cookie,
      );
      if (!moved.json?.ok) console.warn(`  order ${number} → ${to}: ${JSON.stringify(moved.json?.error)}`);
    }
  }
}

/**
 * Adds shopper testimonials.
 * @param cookie Admin session.
 */
async function addTestimonials(cookie, vertical) {
  if (sql('SELECT COUNT(*) AS n FROM testimonials')[0].n > 0) return;
  const items = vertical?.testimonials ?? [
    ['Camila T.', 5, 'es', 'Llegó rápido y el empaque es precioso. Volveré a comprar.'],
    ['Daniel P.', 5, 'en', 'Great quality for the price, and the checkout was effortless.'],
    ['Laura M.', 4, 'es', 'La vela huele increíble. Me gustaría ver más aromas.'],
  ];
  for (const [index, [authorName, rating, locale, body]] of items.entries()) {
    await post(
      '/api/admin/testimonials',
      { authorName, rating, body, locale, isVisible: true, position: index },
      cookie,
    );
  }
}

// A per-vertical demo passes its slug, so its own catalogue module supplies the home page, the theme and the opinions.
// Without one this fills the generic demo store, exactly as it did before there were three.
const slug = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const vertical = slug ? await loadVertical(slug) : undefined;

const cookie = await ownerCookie();
console.log(`signed in as the demo owner${vertical ? ` (${vertical.storeName})` : ''}`);
await addProductPictures(cookie);
await addCategoryPictures(cookie);
await applyDemoTheme(cookie, vertical);
await applyDemoCookieBanner(cookie);
await addHomePage(cookie, vertical);
console.log('pictures added');
await addOrders(cookie);
console.log('orders added');
await addTestimonials(cookie, vertical);
console.log('testimonials added. Demo owner login is in .wrangler/docs-admin.json');
