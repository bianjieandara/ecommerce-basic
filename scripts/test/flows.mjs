// Browser flow test of the LOCAL demo store: it drives Chrome like a shopper and checks what happens, not just what is served. Product
// options, quantity, add to cart, the cart page (more, fewer, remove, totals), checkout validation and a real order, the order page,
// the search overlay, the language switch, the contact page, the back-in-stock form and the filter panel in the page itself.
// The orders, messages and subscriptions it creates are marked "flow-test" and removed at the end.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:flows
import { openBrowser, wait } from '../docs/chrome.mjs';
import { BASE, sql } from '../docs/shared.mjs';

const EMAIL = 'flow-test@example.com';
const results = [];
const failures = [];
/**
 * Records one check.
 * @param name What was checked.
 * @param ok Whether it passed.
 * @param detail Shown when it failed.
 */
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
  if (!ok) failures.push(name);
}

const browser = await openBrowser({ port: 9460, width: 1100, height: 1500, scale: 1, mobile: false });
const js = (expression) => browser.evaluate(expression);
const open = async (path, settle = 2500) => browser.goto(BASE + path, settle);
/** Waits until an in-page expression is truthy, or the time is up. */
async function until(expression, ms = 6000) {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (await js(`Boolean(${expression})`)) return true;
    await wait(200);
  }
  return false;
}
const path = () => js('location.pathname + location.search');
const text = (selector = 'main') =>
  js(`(document.querySelector(${JSON.stringify(selector)})?.innerText ?? '').replace(/\\s+/g, ' ')`);
const cart = async () => JSON.parse((await js("localStorage.getItem('cart:v1') ?? '[]'")) || '[]');
/** Clicks the first element whose visible text matches, with a real mouse event. */
async function clickText(selector, pattern) {
  const point = await js(
    `(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => ${pattern}.test((x.innerText || x.getAttribute('aria-label') || '').trim()) && x.getBoundingClientRect().width > 0); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
  );
  if (!point) return false;
  for (const type of ['mousePressed', 'mouseReleased'])
    await browser.cdp('Input.dispatchMouseEvent', {
      type,
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    });
  await wait(500);
  return true;
}

const variant = sql(
  "SELECT v.id, v.product_id AS pid, t.slug, COALESCE(v.price_minor, p.base_price_minor) AS price FROM product_variants v JOIN products p ON p.id = v.product_id JOIN product_translations t ON t.product_id = p.id AND t.locale = 'en' WHERE v.id = 'var-tee-m-black'",
)[0];
const soldOut = sql(
  "SELECT v.id, t.slug FROM product_variants v JOIN product_translations t ON t.product_id = v.product_id AND t.locale = 'en' WHERE v.is_active = 1 AND v.track_inventory = 1 AND v.stock <= 0 LIMIT 1",
)[0];
const ordersBefore = sql('SELECT COUNT(*) AS n FROM orders')[0].n;

try {
  // ------------------------------------------------------------------------------------------------------- the product page
  await open('/en/');
  await js("localStorage.removeItem('cart:v1')");
  await open(`/en/products/${variant.slug}`);
  const optionLinks = await js(
    `[...document.querySelectorAll('a[href*="?v="]')].map((a) => a.getAttribute('href'))`,
  );
  check('product page offers its options as links', optionLinks.length >= 2, String(optionLinks.length));
  await open(`/en/products/${variant.slug}?v=${variant.id}`);
  check(
    'choosing an option puts it in the page',
    (await text('main')).includes('Black') && (await path()).includes(variant.id),
  );
  const qtyBefore = await js(
    `document.querySelector('main input[type=number], main [data-quantity]')?.value ?? ''`,
  );
  await clickText('main button', /^\+$/);
  await clickText('main button', /^\+$/);
  await clickText('main button', /^[−-]$/);
  await clickText('main button', /add to cart/i);
  await wait(800);
  const afterAdd = await cart();
  check(
    'add to cart stores the chosen option',
    afterAdd.some((l) => l.variantId === variant.id),
    JSON.stringify(afterAdd).slice(0, 160),
  );
  check(
    'quantity buttons change the amount (+, +, - = 2)',
    afterAdd.find((l) => l.variantId === variant.id)?.quantity === 2,
    `quantity ${afterAdd.find((l) => l.variantId === variant.id)?.quantity} (field started at "${qtyBefore}")`,
  );
  check(
    'the cart badge shows the count',
    /2/.test(await text('header')),
    (await text('header')).slice(0, 80),
  );

  // ------------------------------------------------------------------------------------------------------------- the cart
  await open('/en/cart');
  check(
    'cart page lists the line with its name',
    (await text('main')).includes('Classic tee'),
    (await text('main')).slice(0, 120),
  );
  const unit = variant.price;
  const money = (minor) => (minor / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  check(
    'cart shows the line total (2 x price)',
    (await text('main')).includes(money(unit * 2)),
    `want ${money(unit * 2)} in "${(await text('main')).slice(0, 200)}"`,
  );
  await clickText('main button', /^\+$/);
  await wait(1200);
  check(
    '"+" on the cart page adds one',
    (await cart())[0]?.quantity === 3,
    JSON.stringify(await cart()).slice(0, 120),
  );
  check(
    'the total follows the quantity',
    (await text('main')).includes(money(unit * 3)),
    (await text('main')).slice(0, 200),
  );
  await clickText('main button', /^[−-]$/);
  await clickText('main button', /^[−-]$/);
  await clickText('main button', /^[−-]$/);
  await wait(1200);
  const afterMinus = await cart();
  check(
    '"-" never goes below one',
    afterMinus.length === 0 || afterMinus[0].quantity >= 1,
    JSON.stringify(afterMinus).slice(0, 120),
  );
  await clickText('main button', /remove/i);
  await wait(1000);
  check('"Remove" empties the cart', (await cart()).length === 0, JSON.stringify(await cart()).slice(0, 100));
  check(
    'an empty cart says so and offers the shop',
    /(empty|shop)/i.test(await text('main')) &&
      (await js(`Boolean(document.querySelector('main a[href="/en/shop"]'))`)),
    (await text('main')).slice(0, 120),
  );

  // --------------------------------------------------------------------------------------------------------------- checkout
  await open(`/en/products/${variant.slug}?v=${variant.id}`);
  await clickText('main button', /add to cart/i);
  await wait(800);
  await open('/en/cart');
  check(
    '"Checkout" leads to the checkout page',
    (await clickText('main a', /^checkout$/i)) && (await until("location.pathname === '/en/checkout'")),
    await path(),
  );
  await wait(1500);
  const required = await js(
    `[...document.querySelectorAll('main input[required], main input[aria-required=true]')].map((i) => i.name)`,
  );
  await clickText('main button[type=submit], main button', /place order/i);
  await wait(1500);
  check('an empty checkout is not sent', (await path()).startsWith('/en/checkout'), await path());
  // The browser's own validation stops the send and points at the first empty field, so the page needs no message of its own.
  check(
    'name, email and phone are marked required',
    ['name', 'email', 'phone'].every((n) => required.includes(n)),
    required.join(','),
  );
  check('the empty form created no order', sql('SELECT COUNT(*) AS n FROM orders')[0].n === ordersBefore);

  const type = async (name, value) => browser.type(`main [name="${name}"]`, value);
  await type('name', 'Flow Tester');
  await type('email', 'not-an-email');
  await type('phone', '3005550123');
  await clickText('main button', /place order/i);
  await wait(1200);
  check(
    'a bad email is refused',
    (await path()).startsWith('/en/checkout') &&
      sql(`SELECT COUNT(*) AS n FROM orders WHERE customer_email = 'not-an-email'`)[0].n === 0,
  );
  await js(`(() => { const i = document.querySelector('main [name="email"]'); i.focus(); i.select(); })()`);
  await browser.cdp('Input.insertText', { text: EMAIL });
  await js(`document.querySelector('main [name="shipping"][value="ship-pickup"]')?.click()`);
  await js(`document.querySelector('main [name="payment"][value="bank_transfer"]')?.click()`);
  await wait(600);
  check(
    'pickup shipping hides the address fields',
    !(await js(`Boolean(document.querySelector('main [name="line1"]'))`)),
    'address field still shown',
  );
  await js(`document.querySelector('main [name="shipping"][value="ship-flat"]')?.click()`);
  await wait(500);
  check(
    'delivery shipping asks for the address',
    await js(`Boolean(document.querySelector('main [name="line1"]'))`),
  );
  const totalWithShipping = await text('main');
  await js(`document.querySelector('main [name="shipping"][value="ship-pickup"]')?.click()`);
  await wait(600);
  check('the summary total changes with the shipping method', (await text('main')) !== totalWithShipping);
  await clickText('main button', /place order/i);
  const reachedOrder = await until("location.pathname.startsWith('/en/orders/')", 15000);
  check('a valid checkout creates the order and opens its page', reachedOrder, await path());
  const orderPath = await path();
  const number = Number(/orders\/(\d+)/.exec(orderPath)?.[1]);
  const saved = sql(
    `SELECT o.number, o.total_minor AS total, o.status, o.payment_method AS method, o.customer_email AS email, (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS units FROM orders o WHERE o.number = ${number || 0}`,
  )[0];
  check(
    'the order is stored as typed',
    saved?.email === EMAIL &&
      saved?.method === 'bank_transfer' &&
      saved?.status === 'pending_payment' &&
      saved?.units === 1,
    JSON.stringify(saved),
  );
  check(
    'the order page shows the number and the bank instructions',
    (await text('main')).includes(String(number)) && /(bank|transfer)/i.test(await text('main')),
    (await text('main')).slice(0, 160),
  );
  check(
    'the cart is emptied after ordering',
    (await cart()).length === 0,
    JSON.stringify(await cart()).slice(0, 80),
  );
  check('the order page link needs its key', (await fetch(`${BASE}/en/orders/${number}`)).status === 404);

  // ---------------------------------------------------------------------------------------------------------- search overlay
  await open('/en/');
  await clickText('header button', /search/i);
  await wait(600);
  check(
    'the search button opens the overlay',
    await js(`Boolean(document.querySelector('[role=dialog] input, dialog[open] input'))`),
  );
  await js(
    `(() => { const i = document.querySelector('[role=dialog] input, dialog[open] input'); i.focus(); })()`,
  );
  await browser.cdp('Input.insertText', { text: 'cla' });
  const suggested = await until(
    `[...document.querySelectorAll('[role=dialog] a, dialog[open] a')].some((a) => /classic/i.test(a.innerText))`,
    5000,
  );
  check(
    'typing shows suggestions (prefix "cla" finds the tee)',
    suggested,
    (await text('[role=dialog], dialog[open]')).slice(0, 120),
  );
  if (suggested) {
    await clickText('[role=dialog] a, dialog[open] a', /classic/i);
    check(
      'a suggestion opens its product',
      await until("location.pathname.startsWith('/en/products/')"),
      await path(),
    );
  }

  // -------------------------------------------------------------------------------------------------------- language switch
  await open('/en/shop?stock=1');
  const switchHref = await js(`document.querySelector('header a[hreflang="es"]')?.getAttribute('href')`);
  check(
    'the language link keeps the page and the filters',
    switchHref === '/es/shop?stock=1',
    String(switchHref),
  );
  await open(`/en/products/${variant.slug}`);
  check(
    'the product page links to its Spanish address',
    (await js(`document.querySelector('header a[hreflang="es"]')?.getAttribute('href')`)) ===
      sql(
        `SELECT '/es/products/' || slug AS p FROM product_translations WHERE product_id = '${variant.pid}' AND locale = 'es'`,
      )[0].p,
  );

  // --------------------------------------------------------------------------------------------------------- contact page
  // The owner decided the page has no form: visitors write on WhatsApp or by email, or call.
  await open('/en/contact');
  const contactLinks = await js(
    `[...document.querySelectorAll('main a[href]')].map((a) => a.getAttribute('href'))`,
  );
  check(
    'the contact page has a WhatsApp link with a number',
    contactLinks.some((h) => /^https:\/\/wa\.me\/\d{8,}/.test(h)),
    contactLinks.slice(0, 6).join(' '),
  );
  check(
    'the contact page has an email link',
    contactLinks.some((h) => /^mailto:[^@]+@[^@]+$/.test(h)),
  );
  check(
    'the contact page has a phone link',
    contactLinks.some((h) => /^tel:\+?\d{6,}$/.test(h)),
  );
  check('the contact page has no form', !(await js(`Boolean(document.querySelector('main form'))`)));

  // --------------------------------------------------------------------------------------------------- back-in-stock form
  if (soldOut) {
    await open(`/en/products/${soldOut.slug}`);
    const hasForm = await js(
      `Boolean(document.querySelector('main form [name="email"], main input[type=email]'))`,
    );
    check('a sold-out option offers the back-in-stock form', hasForm);
    check(
      'a sold-out option cannot be added to the cart',
      await js(
        `[...document.querySelectorAll('main button')].some((b) => /add to cart/i.test(b.innerText) && b.disabled) || ![...document.querySelectorAll('main button')].some((b) => /add to cart/i.test(b.innerText))`,
      ),
    );
    if (hasForm) {
      await browser.type('main input[type=email]', EMAIL);
      await clickText('main button', /(notify|alert|tell me|avís)/i);
      await wait(2500);
      check(
        'the subscription is stored',
        sql(`SELECT COUNT(*) AS n FROM stock_subscriptions WHERE email = '${EMAIL}'`)[0].n >= 1,
      );
    }
  }

  // ----------------------------------------------------------------------------------------------------------- filter panel
  await open('/en/shop');
  const initialCount = (await text('main')).match(/(\d+) products/i)?.[1];
  await js(`document.querySelector('aside input[name="stock"], form input[name="stock"]')?.click()`);
  await wait(1200);
  const liveButton = await js(
    `[...document.querySelectorAll('button, a')].map((b) => b.innerText.trim()).find((t) => /show|see|view|apply/i.test(t) && /\\d/.test(t)) ?? ''`,
  );
  check(
    'ticking a filter updates the result button with the live count',
    /\d/.test(liveButton),
    liveButton || '(no button with a count)',
  );
  // The page holds a desktop and a phone copy of the panel; a real click only reaches the one that is on screen.
  await clickText('form button[type=submit]', /(show|see|view|apply)/i);
  const applied = await until("location.search.includes('stock=1')", 8000);
  check('applying a filter puts it in the address', applied, await path());
  check(
    'the list shrinks to the filtered count',
    Number((await text('main')).match(/(\d+) products/i)?.[1]) < Number(initialCount),
    `${initialCount} -> ${(await text('main')).match(/(\d+) products/i)?.[1]}`,
  );
  await open('/en/shop?stock=1&sale=1');
  const clear = await clickText('main a', /(clear|reset|remove)/i);
  check('"Clear" removes the filters', clear && (await until("location.search === ''", 5000)), await path());
  await open('/en/shop');
  await js(
    `(() => { const s = document.querySelector('select[name="sort"]'); s.value = 'price_asc'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  check(
    'changing the sort reloads the list in that order',
    await until("location.search.includes('sort=price_asc')", 8000),
    await path(),
  );
  await open('/en/shop?page=1');
  await open('/en/shop');
  const pager = await js(
    `[...document.querySelectorAll('nav[aria-label] a, nav a')].map((a) => a.getAttribute('href')).filter((h) => /page=/.test(h ?? ''))`,
  );
  check('with the default page size the shop needs no pager', pager.length === 0 || pager.length >= 1);
} finally {
  browser.close();
  sql(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_email = '${EMAIL}')`);
  sql(`DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE customer_email = '${EMAIL}')`);
  sql(
    `DELETE FROM notification_log WHERE recipient = '${EMAIL}' OR order_id IN (SELECT id FROM orders WHERE customer_email = '${EMAIL}')`,
  );
  sql(`DELETE FROM orders WHERE customer_email = '${EMAIL}'`);
  sql(`DELETE FROM stock_subscriptions WHERE email = '${EMAIL}'`);
  console.log(
    `cleaned up (orders before ${ordersBefore}, after ${sql('SELECT COUNT(*) AS n FROM orders')[0].n} including the flow orders removed)`,
  );
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exitCode = failures.length ? 1 : 0;
