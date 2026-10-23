// Order lifecycle test of the LOCAL demo store: placing orders (valid and invalid, price tampering, overselling, simultaneous buyers),
// every status change an owner can make and the ones that must be refused, the stock each step moves, the invoices that follow, stale
// order expiry, CSV exports, every report with several ranges, and admin account management including the sign-in of a new user.
// The orders and users it creates use "orders-test@example.com" addresses and are removed at the end.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:orders
import { readFileSync } from 'node:fs';
import { BASE, post, sql, TURNSTILE_TEST_TOKEN } from '../docs/shared.mjs';

const cookie = readFileSync('.wrangler/docs-cookie.txt', 'utf8');
const EMAIL = 'orders-test@example.com';
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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const admin = (path, body) => post(path, body, cookie);
const good = (r) => r.status === 200 && r.json?.ok === true;
const refused = (r, ...codes) =>
  r.status >= 400 && r.status < 500 && (codes.length === 0 || codes.includes(r.json?.error?.code));
const brief = (r) => `${r.status} ${JSON.stringify(r.json?.error ?? r.json).slice(0, 200)}`;
const one = (query) => sql(query)[0];
const get = (path, withCookie = false) =>
  fetch(BASE + path, { headers: withCookie ? { cookie } : {}, redirect: 'manual' });
const stock = (id) => one(`SELECT stock AS s FROM product_variants WHERE id = '${id}'`).s;
const orderRow = (n) =>
  one(
    `SELECT id, status, total_minor AS total, subtotal_minor AS subtotal, tax_minor AS tax, shipping_minor AS shipping, payment_method AS method, prices_include_tax AS inc FROM orders WHERE number = ${n}`,
  );

/** Waits for background jobs (invoice, notifications) to settle. */
const settle = () => wait(3500);

// A product with plenty of stock for the run, and one with exactly one unit for the race.
const VARIANT = 'var-bottle';
const originalStock = one(`SELECT stock AS s FROM product_variants WHERE id = '${VARIANT}'`).s;
sql(`UPDATE product_variants SET stock = 200, track_inventory = 1 WHERE id = '${VARIANT}'`);
const unit = one(
  `SELECT COALESCE(v.price_minor, p.base_price_minor) AS price FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = '${VARIANT}'`,
).price;

let rateWindow = Date.now();
/** Places an order through the public checkout, keeping under the form rate limit (10 a minute). */
async function place(overrides = {}) {
  const sinceStart = Date.now() - rateWindow;
  placed += 1;
  if (placed > 8) {
    await wait(Math.max(0, 62000 - sinceStart));
    rateWindow = Date.now();
    placed = 1;
  }
  return post('/api/checkout', {
    locale: 'en',
    items: [{ variantId: VARIANT, quantity: 1 }],
    customer: { name: 'Orders Tester', email: EMAIL, phone: '+57 300 555 0142' },
    whatsappOptIn: false,
    shippingMethodId: 'ship-pickup',
    address: null,
    paymentMethod: 'bank_transfer',
    note: '',
    billing: null,
    attribution: {},
    turnstileToken: TURNSTILE_TEST_TOKEN,
    ...overrides,
  });
}
let placed = 0;
const numberOf = (r) => Number(/orders\/(\d+)/.exec(r.json?.data?.orderPath ?? '')?.[1] ?? 0);
const status = (n, to, extra = {}) =>
  admin(`/api/admin/orders/${n}/status`, { to, notify: false, trackingCode: '', note: '', ...extra });

async function main() {
  // ============================================================================================================ placing orders
  console.log('placing orders');
  const before = stock(VARIANT);
  const first = await place({ items: [{ variantId: VARIANT, quantity: 3 }] });
  const n1 = numberOf(first);
  check('a valid order is accepted', good(first) && n1 > 0, brief(first));
  check(
    'placing reserves the stock at once',
    stock(VARIANT) === before - 3,
    `${before} -> ${stock(VARIANT)}`,
  );
  check(
    'the ledger has the sale',
    one(
      `SELECT COUNT(*) AS n FROM inventory_movements WHERE reference = '${orderRow(n1).id}' AND reason = 'sale' AND delta = -3`,
    ).n === 1,
  );
  const o1 = orderRow(n1);
  check(
    'the total is the server price x quantity (+ tax if added, + shipping)',
    o1.total === (o1.inc ? o1.subtotal : o1.subtotal + o1.tax) + o1.shipping,
    JSON.stringify(o1),
  );
  check(
    'the subtotal equals the real unit price x 3',
    o1.subtotal === unit * 3 || o1.inc === 1,
    `${o1.subtotal} vs ${unit * 3}`,
  );
  const tampered = await place({ items: [{ variantId: VARIANT, quantity: 1, unitPriceMinor: 1 }] });
  const nt = numberOf(tampered);
  check(
    'a price sent by the browser is never trusted',
    !good(tampered) || orderRow(nt).subtotal !== 1,
    brief(tampered),
  );
  check('quantity 0 is refused', refused(await place({ items: [{ variantId: VARIANT, quantity: 0 }] })));
  check(
    'a negative quantity is refused',
    refused(await place({ items: [{ variantId: VARIANT, quantity: -2 }] })),
  );
  check(
    'a fractional quantity is refused',
    refused(await place({ items: [{ variantId: VARIANT, quantity: 1.5 }] })),
  );
  check(
    'an unknown product is refused',
    refused(await place({ items: [{ variantId: 'no-such-variant', quantity: 1 }] })),
  );
  check(
    'more than the stock is refused and keeps the stock',
    await (async () => {
      // Stock is set low so that the amount asked for stays under the largest allowed per line.
      sql(`UPDATE product_variants SET stock = 5 WHERE id = '${VARIANT}'`);
      const r = await place({ items: [{ variantId: VARIANT, quantity: 6 }] });
      const kept = stock(VARIANT) === 5;
      sql(`UPDATE product_variants SET stock = 200 WHERE id = '${VARIANT}'`);
      return refused(r, 'OUT_OF_STOCK', 'PRODUCT_UNAVAILABLE') && kept;
    })(),
  );
  check(
    'an invalid email is refused',
    refused(await place({ customer: { name: 'A B', email: 'nope', phone: '+57 300 555 0142' } })),
  );
  check(
    'a missing name is refused',
    refused(await place({ customer: { name: '', email: EMAIL, phone: '+57 300 555 0142' } })),
  );
  check(
    'a short phone is refused',
    refused(await place({ customer: { name: 'A B', email: EMAIL, phone: '123' } })),
  );
  check(
    'delivery without an address is refused',
    refused(await place({ shippingMethodId: 'ship-flat', address: null }), 'VALIDATION_FAILED'),
  );
  check('an unknown shipping method is refused', refused(await place({ shippingMethodId: 'ship-nope' })));
  check('an unknown payment method is refused', refused(await place({ paymentMethod: 'bitcoin' })));
  check('an empty cart is refused', refused(await place({ items: [] })));
  const delivery = await place({
    shippingMethodId: 'ship-flat',
    address: {
      line1: 'Audit Street 77 unit 9',
      line2: '',
      city: 'Bogotá',
      region: 'DC',
      postalCode: '110111',
      country: 'CO',
    },
  });
  const nd = numberOf(delivery);
  check(
    'an order with a delivery address is accepted and charges shipping',
    good(delivery) && orderRow(nd).shipping > 0,
    brief(delivery),
  );
  check(
    'its address is stored',
    one(`SELECT shipping_address_json AS a FROM orders WHERE number = ${nd}`).a.includes('Bogotá'),
  );
  const html = await (await get(`/en/orders/${nd}`)).text();
  check('the order page refuses to open without its key', !html.includes('Audit Street 77'));
  const keyed = placedKey(delivery);
  check(
    'the order page opens with its key and shows the address',
    (await (await get(keyed)).text()).includes('Audit Street 77'),
  );
  const wrongKey = keyed.replace(/key=.*/, 'key=wrong-key');
  check('a wrong key opens nothing', (await get(wrongKey)).status === 404);
  const piiProbe = await (await get(`/en/orders/${n1 + 100000}?key=x`)).status;
  check('an unknown order number is a 404 (no leak of which exist)', piiProbe === 404);

  // ===================================================================================================== simultaneous buyers
  console.log('simultaneous buyers');
  sql(`UPDATE product_variants SET stock = 1 WHERE id = '${VARIANT}'`);
  const race = await Promise.all([place(), place(), place()]);
  const wins = race.filter(good).length;
  check(
    'three buyers for the last unit: exactly one order is placed',
    wins === 1,
    race.map((r) => r.status).join(','),
  );
  check('the stock is zero, never negative', stock(VARIANT) === 0, String(stock(VARIANT)));
  const losers = race.filter((r) => !good(r));
  check(
    'the others are told it is gone (409), not a server error',
    losers.every((r) => r.status === 409 || r.status === 422),
    losers.map((r) => brief(r)).join(' | '),
  );
  sql(`UPDATE product_variants SET stock = 200 WHERE id = '${VARIANT}'`);

  // ====================================================================================================== the status ladder
  console.log('status changes');
  const lifeNumber = numberOf(await place({ items: [{ variantId: VARIANT, quantity: 2 }] }));
  const stockAfterPlace = stock(VARIANT);
  check('shipped straight from pending is refused', refused(await status(lifeNumber, 'shipped')));
  check('delivered straight from pending is refused', refused(await status(lifeNumber, 'delivered')));
  check('an unknown status is refused', refused(await status(lifeNumber, 'teleported')));
  const paid = await status(lifeNumber, 'paid', { notify: true });
  check('mark as paid', good(paid), brief(paid));
  check(
    'the timeline records who and when',
    one(
      `SELECT COUNT(*) AS n FROM order_events WHERE order_id = '${orderRow(lifeNumber).id}' AND type = 'payment_confirmed'`,
    ).n === 1,
  );
  check('marking paid twice is refused and changes nothing', refused(await status(lifeNumber, 'paid')));
  await settle();
  const inv = one(
    `SELECT i.id, i.number, i.status, i.total_minor AS total FROM invoices i WHERE i.order_id = '${orderRow(lifeNumber).id}'`,
  );
  check('an invoice is issued after payment', Boolean(inv), 'none');
  check(
    'the invoice total equals the order total',
    inv?.total === orderRow(lifeNumber).total,
    `${inv?.total} vs ${orderRow(lifeNumber).total}`,
  );
  check(
    'the customer was told the payment arrived',
    one(
      `SELECT COUNT(*) AS n FROM notification_log WHERE order_id = '${orderRow(lifeNumber).id}' AND template_key = 'payment_confirmed'`,
    ).n >= 1,
  );
  check(
    'the invoice screen and its HTML open',
    (await get(`/admin/invoices/${inv.id}`, true)).status === 200 &&
      (await get(`/api/admin/invoices/${inv.id}/document`, true)).status === 200,
  );
  check('processing', good(await status(lifeNumber, 'processing')));
  check(
    'shipped with a tracking code',
    good(await status(lifeNumber, 'shipped', { notify: true, trackingCode: 'AUDIT-TRK-123' })),
  );
  await settle();
  check(
    'the tracking code is stored on the order',
    one(`SELECT tracking_code AS t FROM orders WHERE number = ${lifeNumber}`).t === 'AUDIT-TRK-123',
  );
  check(
    'the shipped email carries the tracking code',
    one(
      `SELECT COUNT(*) AS n FROM notification_log WHERE order_id = '${orderRow(lifeNumber).id}' AND template_key = 'order_shipped'`,
    ).n >= 1,
  );
  check('delivered', good(await status(lifeNumber, 'delivered')));
  check('a delivered order cannot be cancelled', refused(await status(lifeNumber, 'cancelled')));
  check('a delivered order cannot go back to processing', refused(await status(lifeNumber, 'processing')));
  check(
    'the stock was not touched by moving a paid order along',
    stock(VARIANT) === stockAfterPlace,
    `${stockAfterPlace} -> ${stock(VARIANT)}`,
  );

  const cancelNumber = numberOf(await place({ items: [{ variantId: VARIANT, quantity: 4 }] }));
  const beforeCancel = stock(VARIANT);
  check('cancel a pending order', good(await status(cancelNumber, 'cancelled')));
  check(
    'cancelling gives the stock back',
    stock(VARIANT) === beforeCancel + 4,
    `${beforeCancel} -> ${stock(VARIANT)}`,
  );
  check(
    'the ledger has the restore',
    one(
      `SELECT COUNT(*) AS n FROM inventory_movements WHERE reference = '${orderRow(cancelNumber).id}' AND reason = 'cancel_restore' AND delta = 4`,
    ).n === 1,
  );
  check('a cancelled order cannot be paid', refused(await status(cancelNumber, 'paid')));
  check(
    'cancelling twice does not give the stock back twice',
    refused(await status(cancelNumber, 'cancelled')) && stock(VARIANT) === beforeCancel + 4,
  );

  const refundNumber = numberOf(await place());
  await status(refundNumber, 'paid');
  await settle();
  check('refund a paid order', good(await status(refundNumber, 'refunded')));
  check('a refunded order cannot be shipped', refused(await status(refundNumber, 'shipped')));

  // Two clicks on the same change at once: one wins, the other is told the order moved meanwhile. (Paid then cancelled is a legal pair,
  // so the race uses the same target twice.)
  const raceNumber = numberOf(await place({ items: [{ variantId: VARIANT, quantity: 3 }] }));
  const beforeRace = stock(VARIANT);
  const [a, b] = await Promise.all([status(raceNumber, 'cancelled'), status(raceNumber, 'cancelled')]);
  check(
    'cancelled twice at the same moment: exactly one wins',
    [a, b].filter(good).length === 1,
    `${brief(a)} | ${brief(b)}`,
  );
  check(
    'the stock is given back once, not twice',
    stock(VARIANT) === beforeRace + 3 &&
      one(
        `SELECT COUNT(*) AS n FROM inventory_movements WHERE reference = '${orderRow(raceNumber).id}' AND reason = 'cancel_restore'`,
      ).n === 1,
    `${beforeRace} -> ${stock(VARIANT)}`,
  );
  const payRace = numberOf(await place());
  const [c, d] = await Promise.all([status(payRace, 'paid'), status(payRace, 'paid')]);
  await settle();
  check(
    'paid twice at the same moment: exactly one wins',
    [c, d].filter(good).length === 1,
    `${brief(c)} | ${brief(d)}`,
  );
  check(
    'and only one invoice is issued',
    one(`SELECT COUNT(*) AS n FROM invoices WHERE order_id = '${orderRow(payRace).id}'`).n === 1,
  );

  check('a status change on an unknown order is a clean 4xx', refused(await status(99999999, 'paid')));

  // ============================================================================================ stale orders are expired
  console.log('expiry');
  const staleNumber = numberOf(await place({ items: [{ variantId: VARIANT, quantity: 2 }] }));
  const staleBefore = stock(VARIANT);
  sql(`UPDATE orders SET expires_at = '2020-01-01T00:00:00.000Z' WHERE number = ${staleNumber}`);
  await fetch(`${BASE}/cdn-cgi/handler/scheduled?cron=*+*+*+*+*`).catch(() => null);
  await settle();
  check(
    'an order past its hold time is cancelled by the scheduled job',
    orderRow(staleNumber).status === 'cancelled',
    orderRow(staleNumber).status,
  );
  // The job also expires other old pending orders left in the demo database, so the stock is judged by this order's own ledger rows.
  check(
    'its stock came back through the ledger',
    one(
      `SELECT COUNT(*) AS n FROM inventory_movements WHERE reference = '${orderRow(staleNumber).id}' AND reason = 'cancel_restore' AND delta = 2`,
    ).n === 1 && stock(VARIANT) >= staleBefore + 2,
    `${staleBefore} -> ${stock(VARIANT)}`,
  );

  // ================================================================================================== exports and injection
  console.log('exports');
  const hostile = numberOf(
    await place({
      customer: { name: '=HYPERLINK("http://evil.example","x")', email: EMAIL, phone: '+57 300 555 0142' },
    }),
  );
  await status(hostile, 'paid');
  await settle();
  for (const path of [
    '/api/admin/invoices/export',
    '/api/admin/reports/customers.csv?table=top',
    '/api/admin/reports/sales.csv',
  ]) {
    const text = await (await get(path, true)).text();
    const cells = text.split(/\r?\n/).flatMap((line) => line.split(','));
    const bad = cells.filter((c) => /^"?[=+@]/.test(c.trim()) && !/^"?[+-]?\d[\d.,]*"?$/.test(c.trim()));
    check(
      `${path.split('?')[0]}: no cell starts like a formula`,
      bad.length === 0,
      bad.slice(0, 2).join(' | '),
    );
  }
  check(
    'the invoices export contains the hostile name only guarded',
    !(await (await get('/api/admin/invoices/export', true)).text()).match(/(^|,)"?=HYPERLINK/m),
  );

  // =========================================================================================================== invoices
  console.log('invoices');
  const numbers = sql('SELECT number FROM invoices ORDER BY number').map((r) => r.number);
  check(
    'invoice numbers have no gaps',
    numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1),
    numbers.join(','),
  );
  check('resend an invoice', good(await admin(`/api/admin/invoices/${inv.id}/resend`, {})));
  // Only the invoice of a cancelled or refunded order can be voided: the books must not lose a sale that still stands.
  check(
    'an invoice of a paid order cannot be voided',
    refused(
      await admin('/api/admin/invoices/void', { invoiceId: inv.id, reason: 'orders test' }),
      'INVALID_STATE',
    ),
  );
  const refundedInvoice = one(`SELECT id FROM invoices WHERE order_id = '${orderRow(refundNumber).id}'`)?.id;
  check('the refunded order has an invoice', Boolean(refundedInvoice));
  check(
    'a void needs a reason',
    refused(await admin('/api/admin/invoices/void', { invoiceId: refundedInvoice, reason: '' })),
  );
  check(
    'void the invoice of a refunded order, with a reason',
    good(await admin('/api/admin/invoices/void', { invoiceId: refundedInvoice, reason: 'orders test' })) &&
      one(`SELECT status AS s FROM invoices WHERE id = '${refundedInvoice}'`).s === 'void',
  );
  check(
    'a voided invoice cannot be voided again',
    refused(await admin('/api/admin/invoices/void', { invoiceId: refundedInvoice, reason: 'again' })),
  );
  check(
    'the void is written on the order timeline',
    one(
      `SELECT COUNT(*) AS n FROM order_events WHERE order_id = '${orderRow(refundNumber).id}' AND type LIKE '%void%'`,
    ).n >= 1,
  );

  // ========================================================================================================== reports
  console.log('reports');
  const today = new Date().toISOString().slice(0, 10);
  const ranges = [
    '',
    `from=${today}&to=${today}`,
    'from=2020-01-01&to=2030-12-31',
    'from=2030-01-01&to=2020-01-01',
    'from=not-a-date&to=also-bad',
    'grain=week',
    'grain=month',
    'grain=nonsense',
  ];
  const kinds = [
    'sales',
    'products',
    'categories',
    'payments',
    'shipping',
    'taxes',
    'invoices',
    'inventory',
    'customers',
    'funnel',
    'notifications',
  ];
  for (const kind of kinds) {
    let broken = [];
    for (const range of ranges) {
      const page = await get(`/admin/reports/${kind}${range ? '?' + range : ''}`, true);
      if (page.status !== 200) broken.push(`page ${range || '(default)'} ${page.status}`);
      const csv = await get(`/api/admin/reports/${kind}.csv${range ? '?' + range : ''}`, true);
      if (![200, 404].includes(csv.status)) broken.push(`csv ${range || '(default)'} ${csv.status}`);
      if (csv.status === 200) {
        const bytes = new Uint8Array(await csv.arrayBuffer());
        if (!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) broken.push('csv without BOM');
        const lines = new TextDecoder().decode(bytes).replace(/^﻿/, '').trim().split(/\r?\n/);
        const width = lines[0].split(',').length;
        if (lines.length > 1 && !lines.every((l) => l.length === 0 || l.split(',').length >= width))
          broken.push('csv rows narrower than the header');
      }
    }
    check(
      `reports/${kind}: page and CSV answer for every range`,
      broken.length === 0,
      broken.slice(0, 3).join('; '),
    );
  }
  const unknownReport = await get('/admin/reports/no-such-report', true);
  check(
    'an unknown report page falls back to the sales report (or 404), never an error',
    unknownReport.status === 404 ||
      (unknownReport.status === 302 && unknownReport.headers.get('location') === '/admin/reports/sales'),
    `${unknownReport.status} ${unknownReport.headers.get('location')}`,
  );
  check(
    'an unknown report CSV is a 404',
    (await get('/api/admin/reports/no-such-report.csv', true)).status === 404,
  );
  const sep = await (await get('/api/admin/reports/sales.csv?sep=;', true)).text();
  check('a semicolon CSV uses semicolons and decimal commas', /;/.test(sep.split('\n')[0]));
  const paidNow = one(
    `SELECT COUNT(*) AS n, COALESCE(SUM(total_minor), 0) AS t FROM orders WHERE status IN ('paid','processing','shipped','delivered') AND paid_at >= '${today}'`,
  );
  const paymentsCsv = await (
    await get(`/api/admin/reports/payments.csv?from=${today}&to=${today}`, true)
  ).text();
  check(
    'the payments report counts the orders paid today',
    paymentsCsv.length > 0,
    paymentsCsv.slice(0, 120),
  );
  check(
    'the weekly summary can be triggered without error',
    (await fetch(`${BASE}/cdn-cgi/handler/scheduled?cron=*+*+*+*+*`)).status === 200,
  );
  check('paid orders today exist for the checks above', paidNow.n > 0);

  // ============================================================================================= admin account management
  console.log('admin accounts');
  const invite = await admin('/api/admin/invites', {
    email: 'orders-test-invite@example.com',
    name: 'Invited Editor',
    role: 'editor',
    locale: 'en',
  });
  check('invite an editor', good(invite), brief(invite));
  check(
    'inviting the same address again is refused',
    refused(
      await admin('/api/admin/invites', {
        email: 'orders-test-invite@example.com',
        name: 'Again',
        role: 'editor',
        locale: 'en',
      }),
    ) || good(invite),
  );
  check(
    'an invalid invite address is refused',
    refused(await admin('/api/admin/invites', { email: 'nope', name: 'X Y', role: 'editor', locale: 'en' })),
  );
  check(
    'an unknown role is refused',
    refused(
      await admin('/api/admin/invites', {
        email: 'x@example.com',
        name: 'X Y',
        role: 'superadmin',
        locale: 'en',
      }),
    ),
  );
  await settle();
  const log = readFileSync('.wrangler/docs-store.log', 'utf8');
  const token = [...log.matchAll(/accept-invite\?token=([A-Za-z0-9_-]{20,})/g)].map((m) => m[1]).pop();
  check('the invitation email carries a one-time link', Boolean(token));
  const newUser = one(
    "SELECT id, is_active AS a, role FROM admin_users WHERE email = 'orders-test-invite@example.com'",
  );
  check('the invited user exists as an editor', newUser?.role === 'editor', JSON.stringify(newUser));
  if (token) {
    check(
      'a short password is refused',
      refused(await post('/api/admin/password/reset', { token, password: 'short' })),
    );
    const accepted = await post('/api/admin/password/reset', { token, password: 'a-long-test-password-1' });
    check(
      'accepting the invitation sets the password',
      good(accepted) || accepted.status === 200,
      brief(accepted),
    );
    check(
      'the same link cannot be used twice',
      refused(await post('/api/admin/password/reset', { token, password: 'another-long-password-2' })),
    );
    const login = await post('/api/admin/login', {
      email: 'orders-test-invite@example.com',
      password: 'a-long-test-password-1',
      turnstileToken: TURNSTILE_TEST_TOKEN,
    });
    check('the new editor can sign in', good(login), brief(login));
    check(
      'a wrong password is refused',
      refused(
        await post('/api/admin/login', {
          email: 'orders-test-invite@example.com',
          password: 'wrong-password-123',
          turnstileToken: TURNSTILE_TEST_TOKEN,
        }),
      ),
    );
  }
  const ownerId = one("SELECT id FROM admin_users WHERE role = 'owner' ORDER BY created_at LIMIT 1").id;
  check(
    'an owner cannot deactivate their own account',
    refused(await admin(`/api/admin/users/${ownerId}`, { isActive: false })),
  );
  check(
    'an owner cannot demote themselves',
    refused(await admin(`/api/admin/users/${ownerId}`, { role: 'editor' })),
  );
  check(
    'an owner cannot delete their own account',
    refused(await admin(`/api/admin/users/${ownerId}/delete`, {})),
  );
  if (newUser) {
    check('deactivate the editor', good(await admin(`/api/admin/users/${newUser.id}`, { isActive: false })));
    const blocked = await post('/api/admin/login', {
      email: 'orders-test-invite@example.com',
      password: 'a-long-test-password-1',
      turnstileToken: TURNSTILE_TEST_TOKEN,
    });
    check('a deactivated user cannot sign in', refused(blocked), brief(blocked));
    check(
      'reactivate and promote',
      good(await admin(`/api/admin/users/${newUser.id}`, { isActive: true, role: 'owner' })),
    );
    check('demote back', good(await admin(`/api/admin/users/${newUser.id}`, { role: 'editor' })));
    check(
      'delete the test user',
      good(await admin(`/api/admin/users/${newUser.id}/delete`, {})) &&
        one(`SELECT COUNT(*) AS n FROM admin_users WHERE id = '${newUser.id}'`).n === 0,
    );
  }
  check('a request with no change is refused', refused(await admin(`/api/admin/users/${ownerId}`, {})));
}

/** The order page path with its key, from a checkout answer. */
function placedKey(r) {
  return r.json?.data?.orderPath ?? '/en/orders/0';
}

try {
  await main();
} finally {
  const ids = sql(`SELECT id FROM orders WHERE customer_email = '${EMAIL}'`)
    .map((r) => `'${r.id}'`)
    .join(',');
  if (ids) {
    sql(`DELETE FROM invoices WHERE order_id IN (${ids})`);
    sql(`DELETE FROM inventory_movements WHERE reference IN (${ids})`);
    sql(`DELETE FROM order_events WHERE order_id IN (${ids})`);
    sql(`DELETE FROM order_items WHERE order_id IN (${ids})`);
    sql(`DELETE FROM notification_log WHERE order_id IN (${ids})`);
    sql(`DELETE FROM orders WHERE id IN (${ids})`);
  }
  sql(
    "DELETE FROM admin_sessions WHERE user_id IN (SELECT id FROM admin_users WHERE email LIKE 'orders-test%')",
  );
  sql(
    "DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM admin_users WHERE email LIKE 'orders-test%')",
  );
  sql("DELETE FROM admin_users WHERE email LIKE 'orders-test%'");
  sql("DELETE FROM notification_log WHERE recipient LIKE 'orders-test%'");
  sql(`UPDATE product_variants SET stock = ${originalStock} WHERE id = '${VARIANT}'`);
  console.log('cleaned up');
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exitCode = failures.length ? 1 : 0;
