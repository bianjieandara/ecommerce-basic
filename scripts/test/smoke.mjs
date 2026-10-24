// Functional smoke test of the LOCAL demo store: every public page in both languages, every admin page and email preview, the
// public API, webhook guards, security headers, cross-site refusals and the checkout paths. One line per check, then a summary;
// the exit code is 1 when anything fails. Takes about two minutes, most of it a pause that lets the form rate limit reset.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:smoke
import { readFileSync } from 'node:fs';
import { BASE, post, sql, TURNSTILE_TEST_TOKEN } from '../docs/shared.mjs';

const cookie = readFileSync('.wrangler/docs-cookie.txt', 'utf8');
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

/** GET and check status (and optionally a text that must appear). */
async function get(path, { expect = 200, includes, admin = false, label } = {}) {
  const response = await fetch(BASE + path, {
    headers: admin ? { cookie } : {},
    redirect: 'manual',
  });
  const text = await response.text();
  const okStatus = Array.isArray(expect) ? expect.includes(response.status) : response.status === expect;
  const okText = !includes || text.includes(includes);
  record(
    label ?? `GET ${path}`,
    okStatus && okText,
    `${response.status}${okText ? '' : ' missing "' + includes + '"'}`,
  );
  return { response, text };
}

const ids = {
  product: sql('SELECT id FROM products LIMIT 1')[0].id,
  order: sql('SELECT number FROM orders ORDER BY number LIMIT 1')[0].number,
  invoice: sql('SELECT id FROM invoices LIMIT 1')[0].id,
  page: sql("SELECT id FROM pages WHERE slug = 'home'")[0]?.id ?? 'home',
};
const slugs = {
  es: { tee: 'camiseta-clasica', category: 'camisetas' },
  en: { tee: 'classic-tee', category: 'apparel' },
};

// 1. Public pages, both languages.
for (const lang of ['es', 'en']) {
  const s = slugs[lang];
  await get(`/${lang}/`, { includes: '<h1', label: `[${lang}] home` });
  await get(`/${lang}/shop`, { includes: s.tee });
  await get(`/${lang}/shop/${s.category}`);
  await get(`/${lang}/products/${s.tee}`, { includes: 'application/ld+json' });
  await get(`/${lang}/cart`);
  await get(`/${lang}/checkout`);
  await get(`/${lang}/contact`);
  await get(`/${lang}/shop?q=tee`);
  await get(`/${lang}/shop?min=10&max=30&sort=price_asc`);
  // A page past the last one sends the visitor to the last real page (see test:filters for the exact target).
  await get(`/${lang}/shop?page=999`, { expect: 301 });
  await get(`/${lang}/products/no-such-product`, { expect: 404 });
  await get(`/${lang}/p/no-such-page`, { expect: 404 });
  await get(`/${lang}/no-such-route`, { expect: 404 });
  await get(`/${lang}/orders/999999`, { expect: [403, 404] });
}
await get('/', { expect: [301, 302, 307, 308], label: 'GET / redirects to a language' });
await get('/xx/', { expect: [404, 301, 302, 308], label: 'GET /xx/ unknown language' });
await get('/sitemap.xml', { includes: '<urlset' });
await get('/robots.txt', { includes: 'Sitemap:' });
await get('/feeds/products.xml', { includes: '<' });
await get('/api/health', { includes: 'ok' });
await get('/api/search/suggest?q=tee&locale=en', { includes: 'tee' });
await get('/api/catalog/count?locale=en', {});
await get('/favicon.svg', {});

// 2. Security headers on a page.
const { response: home } = await get('/en/', { label: 'headers: home' });
for (const header of [
  'content-security-policy',
  'x-content-type-options',
  'referrer-policy',
  'x-frame-options',
]) {
  record(
    `header ${header}`,
    Boolean(home.headers.get(header)),
    home.headers.get(header)?.slice(0, 60) ?? 'missing',
  );
}

// 3. Admin pages need a session; without one they must not serve content.
const adminPages = [
  '/admin',
  '/admin/products',
  '/admin/products/new',
  `/admin/products/${ids.product}`,
  '/admin/categories',
  '/admin/attributes',
  '/admin/media',
  '/admin/inventory',
  '/admin/inventory/movements',
  '/admin/orders',
  `/admin/orders/${ids.order}`,
  '/admin/invoices',
  `/admin/invoices/${ids.invoice}`,
  '/admin/pages',
  `/admin/pages/${ids.page}`,
  '/admin/settings/general',
  '/admin/settings/theme',
  '/admin/settings/checkout',
  '/admin/settings/catalog',
  '/admin/settings/marketing',
  '/admin/emails',
  '/admin/shipping',
  '/admin/testimonials',
  '/admin/users',
  '/admin/whatsapp',
  '/admin/reports/sales',
  '/admin/notification-log',
  '/admin/jobs',
];
// Every email template, as listed by the admin itself, and its preview.
const emailList = await (await fetch(BASE + '/admin/emails', { headers: { cookie } })).text();
for (const key of [
  ...new Set([...emailList.matchAll(/href="\/admin\/emails\/([a-z_]+)"/g)].map((m) => m[1])),
]) {
  adminPages.push(`/admin/emails/${key}`);
  const preview = await post(
    `/api/admin/emails/${key}/preview`,
    { locale: 'en', subject: 'Test', body: 'Hello' },
    cookie,
  );
  record(`email preview ${key}`, preview.status === 200, String(preview.status));
}
// The settings have no page of their own: the index sends the owner to the first group.
await get('/admin/settings', {
  admin: true,
  expect: 302,
  label: 'admin /admin/settings redirects to the first group',
});
for (const path of adminPages) {
  await get(path, { admin: true, label: `admin ${path}` });
  const anon = await fetch(BASE + path, { redirect: 'manual' });
  record(
    `anon blocked ${path}`,
    [301, 302, 303, 307, 308, 401, 403, 404].includes(anon.status),
    String(anon.status),
  );
}
for (const path of ['/admin/login', '/admin/forgot-password']) await get(path);

// 4. Admin API without a session is refused; with a session it answers.
for (const path of [
  '/api/admin/products',
  '/api/admin/categories',
  '/api/admin/settings/theme',
  '/api/admin/pages',
]) {
  const anon = await post(path, {});
  record(`anon POST ${path} refused`, [401, 403, 404, 405].includes(anon.status), String(anon.status));
}

// 5. Webhooks reject unsigned calls.
for (const path of ['/api/webhooks/dlocalgo', '/api/webhooks/paypal', '/api/webhooks/whatsapp']) {
  const response = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"x":1}',
  });
  record(
    `unsigned webhook ${path} refused`,
    response.status >= 400 && response.status < 500,
    String(response.status),
  );
}

// 6. Cross-site POST is refused (CSRF).
// A browser can send text/plain or form bodies cross-site without a preflight; those must be refused. A JSON body needs a
// preflight the server never grants, so it cannot arrive from another site.
for (const type of ['text/plain', 'application/x-www-form-urlencoded']) {
  const cross = await fetch(BASE + '/api/stock-subscriptions', {
    method: 'POST',
    headers: { 'content-type': type, origin: 'https://evil.example' },
    body: '{}',
  });
  record(`cross-site POST (${type}) refused`, cross.status === 403, String(cross.status));
}
const preflight = await fetch(BASE + '/api/stock-subscriptions', {
  method: 'OPTIONS',
  headers: {
    origin: 'https://evil.example',
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type',
  },
});
record(
  'no CORS grant to other sites',
  !preflight.headers.get('access-control-allow-origin'),
  String(preflight.status),
);

// The forms limit is 10 requests per minute per address; let earlier runs' requests expire before the form checks.
await new Promise((resolve) => setTimeout(resolve, 65000));

// 7. Cart quote and checkout validation.
// Earlier runs sell the bottle; restock it so the run does not depend on how often it was repeated.
sql("UPDATE product_variants SET stock = 500 WHERE id = 'var-bottle'");
const variant = sql("SELECT id FROM product_variants WHERE id = 'var-bottle'")[0].id;
const quote = await post('/api/cart/quote', { locale: 'en', items: [{ variantId: variant, quantity: 2 }] });
record('cart quote', quote.status === 200 && quote.json?.ok !== false, `${quote.status}`);
const badQty = await post('/api/cart/quote', { locale: 'en', items: [{ variantId: variant, quantity: -1 }] });
record('cart quote rejects bad quantity', badQty.status >= 400 && badQty.status < 500, `${badQty.status}`);
const noToken = await post('/api/checkout', { locale: 'en', items: [{ variantId: variant, quantity: 1 }] });
record(
  'checkout rejects incomplete body',
  noToken.status >= 400 && noToken.status < 500,
  `${noToken.status}`,
);

// 8. Real checkout paths: bank transfer, cash on delivery, WhatsApp, dLocal Go (hosted link), PayPal (order created).
const customer = { name: 'Smoke Tester', email: 'smoke@example.com', phone: '+57 300 555 0199' };
async function checkout(method) {
  return post('/api/checkout', {
    locale: 'en',
    items: [{ variantId: variant, quantity: 1 }],
    customer,
    whatsappOptIn: false,
    acceptedLegal: true,
    shippingMethodId: 'ship-pickup',
    address: null,
    paymentMethod: method,
    note: '',
    attribution: {},
    turnstileToken: TURNSTILE_TEST_TOKEN,
  });
}
let bankPath = null;
for (const method of ['bank_transfer', 'cash_on_delivery', 'whatsapp', 'dlocalgo', 'paypal']) {
  let placed = await checkout(method);
  // dLocal Go refuses an order number it has already seen on the account (error 5009): a reset demo database, or another store
  // sharing the sandbox account. The next order gets a new number, so a retry or two clears it.
  for (let attempt = 0; attempt < 2 && placed.status === 502; attempt += 1) placed = await checkout(method);
  const data = placed.json?.data;
  const ok = placed.status === 200 && Boolean(data?.orderPath);
  record(
    `checkout ${method}`,
    ok,
    ok
      ? `${data.orderPath.split('?')[0]}${data.redirectUrl ? ' → ' + new URL(data.redirectUrl).host : ''}`
      : `${placed.status} ${JSON.stringify(placed.json?.error ?? placed.json).slice(0, 140)}`,
  );
  if (method === 'bank_transfer' && ok) bankPath = data.orderPath;
}
if (bankPath) {
  await get(bankPath, { includes: '#', label: 'order page with access key' });
  await get(bankPath.split('?')[0], { expect: [403, 404], label: 'order page without key refused' });
}

// 9. Stock subscription.

// 10. Admin read endpoints and exports.
for (const path of [
  '/api/admin/inventory/export',
  '/api/admin/invoices/export',
  '/api/admin/reports/sales.csv',
  '/api/admin/inventory/movements/export',
]) {
  const response = await fetch(BASE + path, { headers: { cookie } });
  record(`admin export ${path}`, response.status === 200, String(response.status));
}
const doc = await fetch(BASE + `/api/admin/invoices/${ids.invoice}/document`, { headers: { cookie } });
record('invoice document (HTML)', doc.status === 200 && (await doc.text()).length > 500, String(doc.status));
// The access key is only in the link the customer gets, so place an order, mark it paid and wait for the invoice job.
let orderRow = null;
if (bankPath) {
  const number = Number(/orders\/(\d+)/.exec(bankPath)?.[1]);
  const moved = await post(
    `/api/admin/orders/${number}/status`,
    { to: 'paid', notify: false, trackingCode: '', note: '' },
    cookie,
  );
  record(
    'admin marks the order paid',
    moved.status === 200,
    `${moved.status} ${JSON.stringify(moved.json?.error ?? '').slice(0, 100)}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 6000));
  orderRow = { number, access_key: new URL(bankPath, BASE).searchParams.get('key') };
}
if (orderRow) {
  const pdf = await fetch(BASE + `/api/orders/${orderRow.number}/invoice.pdf?key=${orderRow.access_key}`);
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  record(
    'customer invoice PDF download',
    pdf.status === 200 && String.fromCharCode(...bytes.slice(0, 4)) === '%PDF',
    `${pdf.status} ${pdf.headers.get('content-type')} ${bytes.length}B`,
  );
  const wrong = await fetch(BASE + `/api/orders/${orderRow.number}/invoice.pdf?key=wrong`);
  record('invoice PDF with a wrong key is 404', wrong.status === 404, String(wrong.status));
}

// 11. Sales report against the database: the CSV (the same numbers as the screen) must match a direct count of paid orders.
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const salesResponse = await fetch(`${BASE}/api/admin/reports/sales.csv?from=${day(-30)}&to=${day(1)}`, {
  headers: { cookie },
});
// text() drops a BOM while decoding, so the first bytes are read before it.
const salesBytes = new Uint8Array(await salesResponse.clone().arrayBuffer());
const salesCsv = await salesResponse.text();
record(
  'sales CSV starts with a UTF-8 BOM (Excel shows accents)',
  salesBytes[0] === 0xef && salesBytes[1] === 0xbb && salesBytes[2] === 0xbf,
);
const salesRows = salesCsv
  .replace(/^﻿/, '')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.split(','));
const csvOrders = salesRows.reduce((sum, row) => sum + Number(row[1]), 0);
const csvRevenue = salesRows.reduce((sum, row) => sum + Number(row[3]), 0);
const direct = sql(
  `SELECT COUNT(*) AS n, COALESCE(SUM(total_minor), 0) AS total FROM orders WHERE status IN ('paid', 'processing', 'shipped', 'delivered') AND paid_at >= '${day(-30)}' AND paid_at < '${day(2)}'`,
)[0];
record(
  'sales report matches the database',
  csvOrders === direct.n && Math.abs(csvRevenue - direct.total / 100) < 0.005,
  `report ${csvOrders} orders / ${csvRevenue.toFixed(2)}; database ${direct.n} / ${(direct.total / 100).toFixed(2)}`,
);

// 12. Product feed (Meta Commerce Manager and Google Merchant Center): every item has the required fields in a valid shape, and
// each target spells the availability the way its service expects ("in stock" for Meta, "in_stock" for Google). In RSS 2.0 title,
// description and link are plain tags; the rest carry the g: prefix.
const PLAIN = new Set(['title', 'description', 'link']);
const field = (item, name) => {
  const tag = PLAIN.has(name) ? name : `g:${name}`;
  // [^] matches any character including a newline, so the text of a tag may span lines.
  return new RegExp(`<${tag}>([^]*?)</${tag}>`).exec(item)?.[1]?.trim() ?? '';
};
const SPELLINGS = { meta: ['in stock', 'out of stock'], google: ['in_stock', 'out_of_stock'] };
for (const [target, allowed] of Object.entries(SPELLINGS)) {
  const feed = await (await fetch(`${BASE}/feeds/products.xml?locale=en&target=${target}`)).text();
  const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  const problems = [];
  for (const item of items) {
    const id = field(item, 'id') || '?';
    for (const name of ['id', 'title', 'description', 'link', 'image_link', 'availability', 'price']) {
      if (!field(item, name)) problems.push(`${id} lacks ${name}`);
    }
    if (!/^\d+\.\d{2} [A-Z]{3}$/.test(field(item, 'price'))) problems.push(`${id} price format`);
    if (!allowed.includes(field(item, 'availability')))
      problems.push(`${id} availability "${field(item, 'availability')}"`);
    if (id.length > 50 || field(item, 'title').length > 150 || field(item, 'description').length > 5000) {
      problems.push(`${id} length limit`);
    }
  }
  record(
    `product feed (${target}): ${items.length} items valid`,
    items.length > 0 && problems.length === 0,
    problems.slice(0, 3).join('; '),
  );
}
const unknownTarget = await fetch(`${BASE}/feeds/products.xml?locale=en&target=other`);
record('product feed refuses an unknown target', unknownTarget.status === 404, String(unknownTarget.status));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('FAILED:\n' + failed.map((r) => `  ${r.name} — ${r.detail}`).join('\n'));
process.exitCode = failed.length ? 1 : 0;
