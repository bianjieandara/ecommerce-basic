// Takes the guide's screenshots from the demo store, so they always show the real screens. Run `npm run docs:store` and
// `node scripts/docs/demo-data.mjs` first. Images go to docs-site/src/assets/screens/.
//
// Usage: node scripts/docs/screenshots.mjs [name-prefix ...]   (no argument = every screenshot)
import { mkdirSync, readFileSync } from 'node:fs';
import { openBrowser, wait } from './chrome.mjs';
import { BASE, post, sql, TURNSTILE_TEST_TOKEN } from './shared.mjs';

/** Language of the screens (es or en): the store pages are opened in it and the demo admin is switched to it. */
const LANG = process.env.DOCS_LANG ?? 'es';
const OTHER = LANG === 'es' ? 'en' : 'es';
/** Slugs differ per language: the demo catalog has Spanish and English addresses. */
const SLUGS =
  LANG === 'es'
    ? { tee: 'camiseta-clasica', category: 'camisetas' }
    : { tee: 'classic-tee', category: 'apparel' };
const OUT = `docs-site/src/assets/screens/${LANG}`;
const DEVICES = {
  phone: { width: 390, height: 844, scale: 2, mobile: true },
  desktop: { width: 1280, height: 800, scale: 1, mobile: false },
};

mkdirSync(OUT, { recursive: true });
sql(`UPDATE admin_users SET locale = '${LANG}'`);

/** Facts about the demo data the screens need: ids and numbers found in the database. */
const demo = {
  product: sql(
    `SELECT p.id FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = '${LANG}' WHERE t.slug = '${SLUGS.tee}'`,
  )[0]?.id,
  shippedOrder: sql("SELECT number FROM orders WHERE status = 'shipped' ORDER BY number LIMIT 1")[0]?.number,
  invoice: sql('SELECT id FROM invoices ORDER BY id LIMIT 1')[0]?.id,
  cart: sql(
    `SELECT v.id AS variantId, v.product_id AS productId, t.name, t.slug, COALESCE(v.price_minor, p.base_price_minor) AS price
       FROM product_variants v JOIN products p ON p.id = v.product_id
       JOIN product_translations t ON t.product_id = p.id AND t.locale = '${LANG}'
      WHERE v.id IN ('var-tee-m-black', 'var-cap') ORDER BY v.id DESC`,
  ),
};

/**
 * Places a fresh order through the public checkout and marks it paid, so the order page and its invoice can be shown with
 * the private link the customer receives.
 * @param cookie Admin session, to record the bank transfer as received.
 * @returns The order page path, with its access key.
 */
async function placeDemoOrder(cookie) {
  const variant = sql("SELECT id FROM product_variants WHERE id = 'var-bottle'")[0].id;
  const placed = await post('/api/checkout', {
    locale: LANG,
    items: [{ variantId: variant, quantity: 1 }],
    customer: { name: 'Camila Torres', email: 'camila.torres@example.com', phone: '+57 300 555 0101' },
    whatsappOptIn: false,
    shippingMethodId: 'ship-pickup',
    address: null,
    paymentMethod: 'bank_transfer',
    note: '',
    attribution: {},
    turnstileToken: TURNSTILE_TEST_TOKEN,
  });
  const orderPath = placed.json?.data?.orderPath;
  const number = Number(/orders\/(\d+)/.exec(orderPath ?? '')?.[1]);
  await post(
    `/api/admin/orders/${number}/status`,
    { to: 'paid', notify: false, trackingCode: '', note: '' },
    cookie,
  );
  // The invoice is issued by a background job; give it a moment.
  await wait(5000);
  return orderPath;
}

/** Every screenshot: file name, address, device and optional preparation. Names group by prefix (shop-, admin-, ...). */
const SHOTS = [
  { name: 'shop-home-phone', path: '/en/', device: 'phone' },
  { name: 'shop-home-desktop', path: '/en/', device: 'desktop' },
  { name: 'shop-home-alt-phone', path: '/en/', device: 'phone', alt: true },
  { name: 'shop-catalog-phone', path: '/en/shop', device: 'phone' },
  { name: 'shop-catalog-desktop', path: '/en/shop', device: 'desktop' },
  { name: 'shop-filters-desktop', path: '/en/shop?min=10&max=30&sort=price_asc', device: 'desktop' },
  { name: 'shop-category-desktop', path: '/en/shop/apparel', device: 'desktop' },
  { name: 'shop-product-phone', path: '/en/products/classic-tee', device: 'phone', full: true },
  { name: 'shop-product-desktop', path: '/en/products/classic-tee', device: 'desktop' },
  { name: 'shop-contact-desktop', path: '/en/contact', device: 'desktop' },
  { name: 'shop-not-found-phone', path: '/en/no-such-page', device: 'phone' },
  {
    name: 'shop-search-phone',
    path: '/en/',
    device: 'phone',
    before: (b) => b.click('[aria-label="Search"], [aria-label="Buscar"]'),
  },
  { name: 'shop-cart-phone', path: '/en/cart', device: 'phone', cart: true },
  { name: 'shop-cart-desktop', path: '/en/cart', device: 'desktop', cart: true },
  { name: 'shop-checkout-phone', path: '/en/checkout', device: 'phone', cart: true, full: true },
  { name: 'shop-checkout-desktop', path: '/en/checkout', device: 'desktop', cart: true, full: true },
  { name: 'shop-order-phone', device: 'phone', order: 'page', full: true },
  { name: 'shop-invoice-desktop', device: 'desktop', order: 'invoice' },
  { name: 'admin-login', path: '/admin/login', device: 'desktop', guest: true },
  { name: 'admin-dashboard', path: '/admin', device: 'desktop' },
  { name: 'admin-dashboard-phone', path: '/admin', device: 'phone' },
  { name: 'admin-products', path: '/admin/products', device: 'desktop' },
  { name: 'admin-product-edit', path: `/admin/products/${demo.product}`, device: 'desktop' },
  {
    name: 'admin-product-variants',
    path: `/admin/products/${demo.product}`,
    device: 'desktop',
    before: (b) =>
      b.evaluate(
        "[...document.querySelectorAll('h2, h3')].find((e) => /Variants/.test(e.textContent))?.scrollIntoView()",
      ),
  },
  { name: 'admin-categories', path: '/admin/categories', device: 'desktop' },
  { name: 'admin-attributes', path: '/admin/attributes', device: 'desktop' },
  { name: 'admin-media', path: '/admin/media', device: 'desktop' },
  { name: 'admin-inventory', path: '/admin/inventory', device: 'desktop' },
  { name: 'admin-inventory-movements', path: '/admin/inventory/movements', device: 'desktop' },
  { name: 'admin-orders', path: '/admin/orders', device: 'desktop' },
  { name: 'admin-orders-phone', path: '/admin/orders', device: 'phone' },
  { name: 'admin-order-detail', path: `/admin/orders/${demo.shippedOrder}`, device: 'desktop', full: true },
  { name: 'admin-invoices', path: '/admin/invoices', device: 'desktop' },
  { name: 'admin-invoice-detail', path: `/admin/invoices/${demo.invoice}`, device: 'desktop', full: true },
  { name: 'admin-messages', path: '/admin/messages', device: 'desktop' },
  { name: 'admin-pages', path: '/admin/pages', device: 'desktop' },
  { name: 'admin-page-builder', path: '/admin/pages/home', device: 'desktop', full: true },
  { name: 'admin-settings', path: '/admin/settings', device: 'desktop' },
  { name: 'admin-settings-general', path: '/admin/settings/general', device: 'desktop', full: true },
  { name: 'admin-settings-theme', path: '/admin/settings/theme', device: 'desktop', full: true },
  { name: 'admin-settings-checkout', path: '/admin/settings/checkout', device: 'desktop', full: true },
  { name: 'admin-emails', path: '/admin/emails', device: 'desktop' },
  { name: 'admin-shipping', path: '/admin/shipping', device: 'desktop' },
  { name: 'admin-testimonials', path: '/admin/testimonials', device: 'desktop' },
  { name: 'admin-users', path: '/admin/users', device: 'desktop' },
  { name: 'admin-whatsapp', path: '/admin/whatsapp', device: 'desktop' },
  { name: 'admin-reports', path: '/admin/reports', device: 'desktop' },
  { name: 'admin-notification-log', path: '/admin/notification-log', device: 'desktop' },
  { name: 'admin-jobs', path: '/admin/jobs', device: 'desktop' },
];

/**
 * The address of a screenshot in the chosen language. Shots are written with English addresses; `alt` shots use the other language.
 * @param shot A screenshot definition.
 * @returns The path to open.
 */
function localize(shot) {
  if (!shot.path) return shot.path;
  const lang = shot.alt ? OTHER : LANG;
  const base = shot.path.startsWith('/en/') ? `/${lang}/${shot.path.slice(4)}` : shot.path;
  return base.replace('classic-tee', SLUGS.tee).replace('/apparel', `/${SLUGS.category}`);
}

const wanted = process.argv.slice(2);
const todo = SHOTS.filter(
  (shot) => wanted.length === 0 || wanted.some((prefix) => shot.name.startsWith(prefix)),
);
const cookies = readFileSync('.wrangler/docs-cookie.txt', 'utf8')
  .split('; ')
  .map((pair) => pair.split(/=(.*)/s));
const orderPath = todo.some((shot) => shot.order)
  ? await placeDemoOrder(cookies.map(([n, v]) => `${n}=${v}`).join('; '))
  : null;
const cartJson = JSON.stringify(
  demo.cart.map((row) => ({
    variantId: row.variantId,
    productId: row.productId,
    name: row.name,
    variantLabel: '',
    quantity: 1,
    unitPriceMinor: row.price,
    compareAtPriceMinor: null,
    productPath: `/${LANG}/products/${row.slug}`,
  })),
);

for (const device of Object.keys(DEVICES)) {
  const shots = todo.filter((shot) => shot.device === device);
  if (shots.length === 0) continue;
  const browser = await openBrowser({ port: 9420, ...DEVICES[device] });
  try {
    for (const shot of shots) {
      await browser.cdp('Network.clearBrowserCookies');
      if (!shot.guest) for (const [name, value] of cookies) await browser.cookie(name, value, BASE);
      let path = localize(shot);
      if (shot.order === 'page') path = orderPath;
      if (shot.order === 'invoice') path = `${orderPath.split('?')[0]}/invoice?${orderPath.split('?')[1]}`;
      if (!path) continue;
      await browser.goto(`${BASE}/${LANG}/`, 600);
      await browser.evaluate(
        `localStorage.setItem('cart:v1', ${JSON.stringify(shot.cart ? cartJson : '[]')})`,
      );
      await browser.goto(BASE + path, 2200);
      if (shot.before) {
        await shot.before(browser);
        await wait(700);
      }
      // A full-page capture would repeat the floating tab bar and chat button in the middle of the page, so hide them.
      // Sections fade in as they scroll into view; a capture that never scrolls would show them empty.
      if (shot.full)
        await browser.evaluate(
          "document.querySelectorAll('.fixed').forEach((e) => { e.style.display = 'none' }); document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-visible'))",
        );
      if (shot.full) await wait(900);
      await browser.shot(`${OUT}/${shot.name}.png`, { fullPage: Boolean(shot.full) });
      console.log('✓', shot.name);
    }
  } finally {
    browser.close();
  }
}
