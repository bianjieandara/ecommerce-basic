// Demo mode against the LOCAL demo store started with `node scripts/docs/store.mjs --demo` (after build and docs:data). It checks
// what a prospect sees (the notices, the shared login, the guided tasks), what the shared account may not do (locks), that
// e-mails stay in the outbox and open only with the order's key, and that a reset restores the snapshot and drops the visitors.
// One line per check, then a summary; the exit code is 1 when anything fails.
//
// Usage: npm run build && node scripts/docs/store.mjs --demo   (leave it running), then  npm run test:demo
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertDemoConfig } from '../lib/clients.mjs';
import { BASE, DEMO_TEST_VARS, sql, TURNSTILE_TEST_TOKEN } from '../docs/shared.mjs';

const results = [];
/**
 * Records one check and prints it.
 * @param {string} name What is checked.
 * @param {boolean} ok Whether it held.
 * @param {string} [detail] Extra text for a failure.
 */
function record(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  — ${detail}` : ''}`);
}

/**
 * Sends a JSON request.
 * @param {string} path Path on the store.
 * @param {unknown} body JSON body, or undefined for none.
 * @param {string} [cookie] Session cookie.
 * @param {string} [method] HTTP method.
 * @returns {Promise<{ status: number, json: any, text: string, headers: Headers }>} The answer.
 */
async function call(path, body, cookie, method = 'POST') {
  const headers = { origin: BASE };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  // A connection kept from before a local publish can be closed by the dev server reloading: retry once on a new one.
  const send = () =>
    fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
  let response;
  try {
    response = await send();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    response = await send();
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON (a page or a file): the text is what the checks look at.
  }
  return { status: response.status, json, text, headers: response.headers };
}

/**
 * Signs in and returns the session cookie.
 * @param {string} email Account e-mail.
 * @param {string} password Account password.
 * @returns {Promise<string>} The cookie to send back ("name=value"), or an empty string.
 */
async function signIn(email, password) {
  const response = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, password, turnstileToken: TURNSTILE_TEST_TOKEN }),
  });
  const cookies = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
  return cookies.map((value) => value.split(';')[0]).join('; ');
}

/**
 * Waits until a condition holds, polling the local database.
 * @param {() => boolean} check Condition to test.
 * @param {number} timeoutMs Longest wait.
 * @returns {Promise<boolean>} True when it held in time.
 */
async function until(check, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

// The owner's session comes from the local owner account that docs:data creates.
const owner = JSON.parse(readFileSync('.wrangler/docs-admin.json', 'utf8'));
const ownerCookie = await signIn(owner.email, owner.password);
let snapshotFile = null;
let visitorOrder = null;

// 0. The store runs in demo mode.
{
  const home = await call('/en/', undefined, '', 'GET');
  record('the storefront shows the demo notice', home.text.includes('Demo store.'));
}

// 1. Publish a fresh snapshot of the sample store into the local bucket, then reset the store to it.
{
  execSync('node scripts/demo/snapshot.mjs', { stdio: 'pipe' });
  execSync('node scripts/demo/publish.mjs --local', { stdio: 'pipe' });
  const fresh = JSON.parse(readFileSync('clients/demo/snapshot/snapshot.json', 'utf8'));
  snapshotFile = fresh;
  record('the snapshot names the demo account', fresh.accountId === 'demo-account');
  const reset = await call('/api/admin/demo/reset', undefined, ownerCookie);
  record(
    'an owner can reset the demo (303 back to the dashboard)',
    reset.status === 303,
    String(reset.status),
  );
  const products = sql('SELECT COUNT(*) AS n FROM products')[0].n;
  record(
    'the reset restores the sample products',
    products === fresh.tables.products.length,
    `${products} vs ${fresh.tables.products.length}`,
  );
}

// 2. What a prospect sees.
{
  const login = await call('/admin/login', undefined, '', 'GET');
  record(
    'the sign-in page offers the shared demo login',
    login.text.includes(DEMO_TEST_VARS.DEMO_LOGIN_EMAIL),
  );
  const dashboard = await call('/admin', undefined, ownerCookie, 'GET');
  record('the admin shows the demo pill', dashboard.text.includes('resets every night'));
  record('the dashboard lists the guided tasks', dashboard.text.includes('Try this'));
  const checkout = await call('/en/checkout', undefined, '', 'GET');
  record('checkout shows the test payment details', checkout.text.includes('4111 1111 1111 1111'));
}

// 3. The shared account cannot take the store over.
const demoCookie = await signIn(DEMO_TEST_VARS.DEMO_LOGIN_EMAIL, DEMO_TEST_VARS.DEMO_LOGIN_PASSWORD);
{
  record('the shared demo login signs in', demoCookie.includes('admin_session='));
  const invite = await call(
    '/api/admin/invites',
    { email: 'invitee@demo-store.test', name: 'Invitee', role: 'editor', locale: 'en' },
    demoCookie,
  );
  record(
    'the demo account cannot invite admins (DEMO_LOCKED)',
    invite.json?.error?.code === 'DEMO_LOCKED',
    invite.text,
  );
  const order = sql("SELECT number FROM orders WHERE status = 'paid' ORDER BY number LIMIT 1")[0];
  if (order) {
    const refund = await call(`/api/admin/orders/${order.number}/refund`, {}, demoCookie);
    record(
      'the demo account cannot refund (DEMO_LOCKED)',
      refund.json?.error?.code === 'DEMO_LOCKED',
      refund.text,
    );
  } else {
    record('the demo account cannot refund (DEMO_LOCKED)', false, 'no paid order in the snapshot');
  }
  const forgot = await call('/api/admin/password/forgot', {
    email: DEMO_TEST_VARS.DEMO_LOGIN_EMAIL,
    turnstileToken: TURNSTILE_TEST_TOKEN,
  });
  record(
    'a reset for the demo login is refused (DEMO_LOCKED)',
    forgot.json?.error?.code === 'DEMO_LOCKED',
    forgot.text,
  );
  const users = await call('/admin/users', undefined, ownerCookie, 'GET');
  record('the owner account is not locked', users.status === 200, String(users.status));
}

// 4. E-mails stay in the outbox: an order is placed, its confirmation is read back with the order key only.
{
  const variant = snapshotFile.tables.product_variants.find((row) => row.is_active === 1 && row.stock > 0);
  const placed = await call('/api/checkout', {
    locale: 'en',
    items: [{ variantId: variant.id, quantity: 1 }],
    customer: { name: 'Outbox Check', email: 'outbox@demo-store.test', phone: '+573001112233' },
    shippingMethodId: 'ship-pickup',
    address: null,
    paymentMethod: 'cash_on_delivery',
    turnstileToken: TURNSTILE_TEST_TOKEN,
    acceptedLegal: true,
  });
  record('a checkout is accepted in demo mode', placed.status === 200, placed.text.slice(0, 200));
  const number = placed.json?.data?.number;
  const key = new URL(placed.json.data.orderPath, BASE).searchParams.get('key') ?? '';
  const sent = await until(
    () =>
      sql(
        `SELECT provider_message_id AS id FROM notification_log WHERE order_id = (SELECT id FROM orders WHERE number = ${number}) AND channel = 'email' AND status = 'sent'`,
      ).length > 0,
    40_000,
  );
  record('the confirmation e-mail is recorded as sent', sent);
  const messageId = sql(
    `SELECT provider_message_id AS id FROM notification_log WHERE order_id = (SELECT id FROM orders WHERE number = ${number}) AND channel = 'email' AND status = 'sent' LIMIT 1`,
  )[0]?.id;
  if (messageId) {
    const view = await call(`/api/orders/${number}/emails/${messageId}?key=${key}`, undefined, '', 'GET');
    record(
      'the e-mail opens with the order key',
      view.status === 200 && view.text.includes('<'),
      String(view.status),
    );
    record(
      'the e-mail is served with a sandbox policy',
      (view.headers.get('content-security-policy') ?? '').startsWith('sandbox'),
    );
    const without = await call(`/api/orders/${number}/emails/${messageId}`, undefined, '', 'GET');
    record('the e-mail does not open without the key', without.status === 404, String(without.status));
    const page = await call(`/en/orders/${number}?key=${key}`, undefined, '', 'GET');
    record('the order page lists its e-mails', page.text.includes('E-mails of this order'));
  } else {
    record('the e-mail opens with the order key', false, 'no sent e-mail to open');
  }
  // Remember the visitor's order so the reset below can be seen to remove it.
  visitorOrder = number;
}

// 5. The reset restores the snapshot and removes what visitors did.
{
  const before = {
    orders: sql('SELECT COUNT(*) AS n FROM orders')[0].n,
    products: sql('SELECT COUNT(*) AS n FROM products')[0].n,
  };
  const added = await call(
    '/api/admin/products',
    {
      id: null,
      status: 'active',
      basePriceMinor: 1500,
      compareAtPriceMinor: null,
      taxRateBp: null,
      isFeatured: false,
      translations: {
        es: {
          name: 'Visitor product',
          slug: 'visitor-product',
          shortDescription: '',
          descriptionMd: '',
          seoTitle: '',
          seoDescription: '',
        },
        en: {
          name: 'Visitor product',
          slug: 'visitor-product-en',
          shortDescription: '',
          descriptionMd: '',
          seoTitle: '',
          seoDescription: '',
        },
      },
      categoryIds: [],
      imageIds: [],
      variants: [
        {
          id: null,
          sku: 'VISITOR-1',
          barcode: null,
          priceMinor: null,
          compareAtPriceMinor: null,
          costMinor: null,
          stock: 3,
          stockBefore: null,
          trackInventory: true,
          lowStockThreshold: null,
          imageMediaId: null,
          isActive: true,
          attributeValueIds: [],
        },
      ],
      stockNote: null,
    },
    demoCookie,
  );
  record('a visitor adds a product', added.status === 200, added.text.slice(0, 160));
  const reset = await call('/api/admin/demo/reset', undefined, ownerCookie);
  record('the reset runs', reset.status === 303, String(reset.status));
  const after = {
    orders: sql('SELECT COUNT(*) AS n FROM orders')[0].n,
    products: sql('SELECT COUNT(*) AS n FROM products')[0].n,
    emails: sql("SELECT COUNT(*) AS n FROM notification_log WHERE channel = 'email'")[0].n,
  };
  record(
    'the visitor product is gone',
    after.products === snapshotFile.tables.products.length,
    `${after.products} products vs ${snapshotFile.tables.products.length} in the snapshot (before: ${before.products})`,
  );
  record(
    'the visitor order is gone',
    after.orders === snapshotFile.tables.orders.length,
    `${after.orders} orders vs ${snapshotFile.tables.orders.length} in the snapshot (before: ${before.orders})`,
  );
  record('the message log starts empty', after.emails === 0, `${after.emails} e-mails`);
  if (visitorOrder) {
    const gone = await call(`/en/orders/${visitorOrder}?key=x`, undefined, '', 'GET');
    record('the visitor order page is gone', gone.status === 404, String(gone.status));
  }
  const newest = sql('SELECT MAX(created_at) AS latest FROM orders')[0]?.latest;
  const ageHours = newest ? (Date.now() - Date.parse(newest)) / 3_600_000 : Infinity;
  record(
    'the snapshot orders are moved to recent dates',
    ageHours < 48,
    `newest order ${ageHours.toFixed(1)} h old`,
  );
  const account = sql("SELECT role, is_active FROM admin_users WHERE id = 'demo-account'")[0];
  record(
    'the shared account is written with the owner role',
    account?.role === 'owner' && account?.is_active === 1,
  );
  record(
    'the owner account survives the reset',
    sql(`SELECT COUNT(*) AS n FROM admin_users WHERE email = '${owner.email}'`)[0].n === 1,
  );
}

// 6. The tables a snapshot may write match the tables the reset allows (scripts/demo/snapshot.mjs and the domain list).
{
  const snapshotTables = [
    ...readFileSync('scripts/demo/snapshot.mjs', 'utf8')
      .split('export const SNAPSHOT_TABLES = [')[1]
      .split('];')[0]
      .matchAll(/'([a-z_]+)'/g),
  ].map((match) => match[1]);
  const restoreTables = [
    ...readFileSync('src/domain/demo/restore-tables.ts', 'utf8')
      .split('RESTORE_TABLES = [')[1]
      .split('] as const')[0]
      .matchAll(/'([a-z_]+)'/g),
  ].map((match) => match[1]);
  record(
    'the snapshot and the reset name the same tables, in order',
    JSON.stringify(snapshotTables) === JSON.stringify(restoreTables),
  );
}

// 7. Deploy guard: demo mode is refused anywhere but the demo, with live payments, or without a login.
{
  const demo = {
    slug: 'demo',
    vars: {
      DEMO_MODE: 'on',
      EMAIL_TRANSPORT: 'outbox',
      PAYPAL_ENV: 'sandbox',
      DLOCALGO_ENV: 'sandbox',
      DEMO_LOGIN_EMAIL: 'try@demo-store.test',
      DEMO_LOGIN_PASSWORD: 'long-enough-password',
    },
  };
  const refuses = (client) => {
    try {
      assertDemoConfig(client);
      return false;
    } catch {
      return true;
    }
  };
  record('the demo configuration passes the deploy guard', !refuses(demo));
  record('demo mode on a real client is refused', refuses({ ...demo, slug: 'acme' }));
  record(
    'demo mode with live payments is refused',
    refuses({ ...demo, vars: { ...demo.vars, PAYPAL_ENV: 'live' } }),
  );
  record(
    'demo mode without a login is refused',
    refuses({ ...demo, vars: { ...demo.vars, DEMO_LOGIN_PASSWORD: '' } }),
  );
  record(
    'demo mode that sends e-mail is refused',
    refuses({ ...demo, vars: { ...demo.vars, EMAIL_TRANSPORT: 'cloudflare' } }),
  );
}

const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exitCode = passed === results.length ? 0 : 1;
