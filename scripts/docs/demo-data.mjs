// Fills a LOCAL demo store with believable data for the guide's screenshots: an owner account, a picture for each seed
// product, orders in every state, invoices, contact messages and testimonials. It only talks to a store running on this
// machine (default http://localhost:4400, started by `npm run docs:store`) and never touches the real development database.
//
// Usage: node scripts/docs/demo-data.mjs
// Environment: DOCS_BASE (store URL), DOCS_STATE (wrangler persist folder, default .wrangler/docs-state), see shared.mjs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { addCategoryPictures, addProductPictures } from './pictures.mjs';
import { addHomePage, applyDemoTheme } from './home-content.mjs';
import { post, sql, TURNSTILE_TEST_TOKEN } from './shared.mjs';

const ACCOUNT_FILE = '.wrangler/docs-admin.json';

/**
 * Signs in as the demo owner, creating the account the first time.
 * @returns The session cookie header value.
 */
async function ownerCookie() {
  mkdirSync('.wrangler', { recursive: true });
  const account = existsSync(ACCOUNT_FILE)
    ? JSON.parse(readFileSync(ACCOUNT_FILE, 'utf8'))
    : { email: 'maria@demo-store.test', password: randomBytes(15).toString('base64url') };
  writeFileSync(ACCOUNT_FILE, JSON.stringify(account));
  const vars = Object.fromEntries(
    readFileSync('.dev.vars', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
  );
  let response = await post('/api/admin/login', { ...account, turnstileToken: TURNSTILE_TEST_TOKEN });
  if (response.status !== 200) {
    response = await post('/api/admin/setup', {
      setupToken: vars.SETUP_TOKEN,
      name: 'Maria Rojas',
      email: account.email,
      password: account.password,
      locale: 'en',
    });
  }
  if (response.status !== 200) throw new Error(`Could not sign in: ${JSON.stringify(response.json)}`);
  const cookie = response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');
  writeFileSync('.wrangler/docs-cookie.txt', cookie);
  return cookie;
}

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
  const variants = sql(
    'SELECT v.id, v.product_id FROM product_variants v WHERE v.is_active = 1 ORDER BY v.product_id',
  );
  const variantOf = (productId) => variants.find((variant) => variant.product_id === productId)?.id;
  const plans = [
    {
      shopper: 0,
      items: [
        ['prod-tee', 2],
        ['prod-cap', 1],
      ],
      method: 'bank_transfer',
      ship: 'ship-pickup',
      steps: ['paid', 'processing', 'shipped', 'delivered'],
    },
    {
      shopper: 1,
      items: [['prod-hoodie', 1]],
      method: 'cash_on_delivery',
      ship: 'ship-flat',
      steps: ['paid', 'processing', 'shipped'],
    },
    {
      shopper: 2,
      items: [
        ['prod-candle', 2],
        ['prod-notebook', 2],
      ],
      method: 'bank_transfer',
      ship: 'ship-flat',
      steps: ['paid', 'processing'],
    },
    { shopper: 3, items: [['prod-plant', 1]], method: 'whatsapp', ship: 'ship-pickup', steps: [] },
    { shopper: 4, items: [['prod-bottle', 3]], method: 'bank_transfer', ship: 'ship-flat', steps: ['paid'] },
    {
      shopper: 5,
      items: [['prod-tote', 1]],
      method: 'bank_transfer',
      ship: 'ship-pickup',
      steps: ['cancelled'],
    },
  ];
  for (const plan of plans.slice(existing)) {
    const [name, email, phone] = SHOPPERS[plan.shopper];
    const placed = await post('/api/checkout', {
      locale: plan.shopper % 2 === 0 ? 'es' : 'en',
      items: plan.items.map(([productId, quantity]) => ({ variantId: variantOf(productId), quantity })),
      customer: { name, email, phone },
      whatsappOptIn: false,
      shippingMethodId: plan.ship,
      address:
        plan.ship === 'ship-flat'
          ? {
              line1: 'Calle 45 # 12-34',
              line2: 'Apto 301',
              city: 'Bogotá',
              region: 'Cundinamarca',
              postalCode: '110111',
              country: 'CO',
            }
          : null,
      paymentMethod: plan.method,
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

/** Messages from shoppers to the contact form. */
async function addMessages() {
  if (sql('SELECT COUNT(*) AS n FROM contact_messages')[0].n > 0) return;
  const messages = [
    ['Paula Rincón', 'paula.rincon@example.com', 'Do you ship to Medellín, and how long does it take?'],
    [
      'Jorge Salazar',
      'jorge.salazar@example.com',
      'Quiero comprar 20 tazas para un evento. ¿Hay descuento por cantidad?',
    ],
    [
      'Ana Beltrán',
      'ana.beltran@example.com',
      'The hooded sweatshirt I want is out of stock. When will it be back?',
    ],
  ];
  for (const [name, email, message] of messages) {
    await post('/api/contact', {
      locale: 'en',
      name,
      email,
      phone: '',
      message,
      website: '',
      turnstileToken: TURNSTILE_TEST_TOKEN,
    });
  }
}

/**
 * Adds shopper testimonials.
 * @param cookie Admin session.
 */
async function addTestimonials(cookie) {
  if (sql('SELECT COUNT(*) AS n FROM testimonials')[0].n > 0) return;
  const items = [
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

const cookie = await ownerCookie();
console.log('signed in as the demo owner');
await addProductPictures(cookie);
await addCategoryPictures(cookie);
await applyDemoTheme(cookie);
await addHomePage(cookie);
console.log('pictures added');
await addOrders(cookie);
console.log('orders added');
await addMessages();
await addTestimonials(cookie);
console.log('messages and testimonials added. Demo owner login is in', ACCOUNT_FILE);
