// Purchase tracking test of a LOCAL store started with `--tracking` (Stage 19): what GA4 and Meta receive when orders are paid, with
// no Google or Meta account. The store talks to two fakes started here: the Measurement Protocol (fake-ga4.mjs) and the Graph API with
// its Conversions API route (fake-graph.mjs). Four orders are placed with different cookies and then paid by the owner:
//   consent and GA cookies  -> one purchase to GA4 and one to Meta, Meta's with hashed e-mail and phone only
//   no cookies at all       -> nothing to either
//   consent, no GA cookie   -> Meta only (GA4 needs the visitor id)
//   refused, GA cookies     -> nothing to either, and no GA identity stored
// Then tracking-browser.mjs checks what the pages give GA4 and the Pixel in Chrome. Nothing leaves this machine.
//
// Usage (a second store, so another one on port 4400 is left alone):
//   npx astro build --outDir .wrangler/track-dist
//   DOCS_DIST=.wrangler/track-dist DOCS_PORT=4420 DOCS_STATE=.wrangler/track-state DOCS_GRAPH_PORT=5820 DOCS_GA4_PORT=5830 \
//     DOCS_INSPECTOR_PORT=9420 node scripts/docs/store.mjs --tracking      (leave it running)
//   DOCS_BASE=http://localhost:4420 DOCS_STATE=.wrangler/track-state DOCS_GRAPH_PORT=5820 DOCS_GA4_PORT=5830 npm run test:tracking
import { createHash } from 'node:crypto';
import { ownerCookie } from '../docs/owner-session.mjs';
import { DEMO_TRACKING_VARS, post, sql, TURNSTILE_TEST_TOKEN } from '../docs/shared.mjs';
import { startFakeGa4 } from './fake-ga4.mjs';
import { startFakeGraph } from './fake-graph.mjs';
import { runBrowserFlows } from './tracking-browser.mjs';

const GA4_ID = 'G-TESTTRACK1';
const PIXEL_ID = '123456789012345';
const VARIANT = 'var-bottle';
const SHOPPER = { name: 'Tracking Tester', email: 'Tracking-Test@Example.com', phone: '+57 300 555 0142' };
const GA_COOKIES = '_ga=GA1.1.111111.1700000000; _ga_TESTTRACK1=GS2.1.s1700000999$o1$g1$t1700000999';

const results = [];
/** Records one check. */
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + String(detail).slice(0, 400)}`,
  );
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Polls until a condition holds or the time is up (queued jobs run in batches of up to 5 seconds). */
async function until(condition, ms = 40000) {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (condition()) return true;
    await wait(500);
  }
  return condition();
}
const sha = (text) => createHash('sha256').update(text).digest('hex');

const adminCookie = await ownerCookie(process.env.DOCS_COOKIE ?? '.wrangler/track-cookie.txt');
const original = JSON.parse(
  sql("SELECT value_json FROM settings WHERE group_key = 'marketing'")[0]?.value_json ?? '{}',
);
sql(`UPDATE product_variants SET stock = 500, track_inventory = 1 WHERE id = '${VARIANT}'`);
// The orders are paid by hand, so the store must offer a manual method; the setting is restored at the end.
const originalCheckout = JSON.parse(
  sql("SELECT value_json FROM settings WHERE group_key = 'checkout'")[0]?.value_json ?? '{}',
);
const manualMethods = [...new Set([...(originalCheckout.enabledMethods ?? []), 'cash_on_delivery'])];

/**
 * Places a cash-on-delivery order through the public checkout with the given cookies.
 * @param cookies Cookie header the buyer's browser would send; empty for none.
 * @returns The order's number, path (with its key) and the facts the store kept.
 */
async function place(cookies) {
  const body = {
    locale: 'en',
    items: [{ variantId: VARIANT, quantity: 2 }],
    customer: SHOPPER,
    whatsappOptIn: false,
    acceptedLegal: true,
    shippingMethodId: 'ship-pickup',
    address: null,
    paymentMethod: 'cash_on_delivery',
    note: '',
    billing: null,
    attribution: {},
    turnstileToken: TURNSTILE_TEST_TOKEN,
  };
  let answer = await post('/api/checkout', body, cookies);
  if (answer.status === 429) {
    await wait(62000);
    answer = await post('/api/checkout', body, cookies);
  }
  const path = answer.json?.data?.orderPath ?? '';
  const number = Number(/orders\/(\d+)/.exec(path)?.[1] ?? 0);
  if (!number) throw new Error(`Checkout refused the order: ${answer.status} ${JSON.stringify(answer.json)}`);
  const row = sql(
    `SELECT id, total_minor AS total, marketing_consent AS consent, ga_client_id AS client, ga_session_id AS session FROM orders WHERE number = ${number}`,
  )[0];
  return { number, path, ...row };
}
/** The owner marks the order paid, the step a bank transfer or cash on delivery takes. */
const pay = (number) =>
  post(
    `/api/admin/orders/${number}/status`,
    { to: 'paid', notify: false, trackingCode: '', note: '' },
    adminCookie,
  );

const graph = await startFakeGraph();
const ga4 = await startFakeGa4(undefined, {
  measurementId: GA4_ID,
  apiSecret: DEMO_TRACKING_VARS.GA4_API_SECRET,
});
try {
  const saved = await post(
    '/api/admin/settings/marketing',
    {
      values: {
        ...original,
        metaPixelId: PIXEL_ID,
        metaCapiEnabled: true,
        ga4MeasurementId: GA4_ID,
        consentBannerMode: 'always',
      },
    },
    adminCookie,
  );
  check('the marketing settings were saved', saved.status === 200, `${saved.status}`);
  const methods = await post(
    '/api/admin/settings/checkout',
    { values: { ...originalCheckout, enabledMethods: manualMethods } },
    adminCookie,
  );
  check(
    'cash on delivery is offered for the run',
    methods.status === 200,
    `${methods.status} ${JSON.stringify(methods.json?.error ?? '')}`,
  );
  await wait(1500);

  // ---- Server: four orders, four sets of cookies.
  const full = await place(`consent=v1.m1; ${GA_COOKIES}`);
  const none = await place('');
  const noGa = await place('consent=v1.m1');
  const refused = await place(`consent=v1.m0; ${GA_COOKIES}`);

  check(
    'consent and GA cookies: the order keeps the consent and the GA ids',
    full.consent === 1 && full.client === '111111.1700000000' && full.session === '1700000999',
    JSON.stringify(full),
  );
  check(
    'no cookies: no consent, no GA identity stored',
    none.consent === 0 && none.client === null && none.session === null,
    JSON.stringify(none),
  );
  check(
    'consent without a GA cookie: consent kept, no GA identity',
    noGa.consent === 1 && noGa.client === null,
    JSON.stringify(noGa),
  );
  check(
    'refused with GA cookies present: no consent and the GA identity is not stored',
    refused.consent === 0 && refused.client === null && refused.session === null,
    JSON.stringify(refused),
  );

  for (const order of [full, none, noGa, refused]) {
    const paid = await pay(order.number);
    check(
      `order ${order.number} was marked paid`,
      paid.status === 200 && paid.json?.ok === true,
      `${paid.status} ${JSON.stringify(paid.json?.error ?? '')}`,
    );
  }

  const gaPurchases = () => ga4.requests.filter((r) => r.body?.events?.some((e) => e.name === 'purchase'));
  const metaPurchases = () =>
    graph.requests
      .filter((r) => /\/events$/.test(r.path) && r.status === 200)
      .flatMap((r) => r.body.data.map((event) => ({ event, request: r })))
      .filter(({ event }) => event.event_name === 'Purchase');
  const arrived = await until(() => gaPurchases().length >= 1 && metaPurchases().length >= 2);
  check(
    'the purchases arrived at GA4 and Meta',
    arrived,
    `ga4 ${gaPurchases().length}, meta ${metaPurchases().length}`,
  );
  await wait(9000); // time for a stray or repeated send to show up

  // ---- GA4: exactly one purchase, for the order with consent and a GA identity.
  check('GA4 received exactly one purchase', gaPurchases().length === 1, `${gaPurchases().length}`);
  const g = gaPurchases()[0];
  const params = g?.body.events[0].params ?? {};
  check(
    'GA4: the request is valid for the protocol (id, secret, client id, purchase fields)',
    g?.problems.length === 0,
    JSON.stringify(g?.problems),
  );
  check(
    'GA4: it is that order, with the visitor and session of its cookies',
    params.transaction_id === full.id &&
      g?.body.client_id === '111111.1700000000' &&
      params.session_id === '1700000999',
    JSON.stringify({ params, client: g?.body.client_id }),
  );
  check(
    'GA4: value in major units, currency and the item',
    params.value === full.total / 100 &&
      /^[A-Z]{3}$/.test(params.currency) &&
      params.items?.[0]?.item_id === VARIANT &&
      params.items?.[0]?.quantity === 2,
    JSON.stringify(params),
  );
  check(
    'GA4: no personal data in the purchase',
    !/tracking-test|3005550142|"email"|"phone"/i.test(JSON.stringify(g?.body)),
    JSON.stringify(g?.body),
  );

  // ---- Meta: one purchase for each order whose buyer consented, with hashes and nothing readable.
  const meta = metaPurchases();
  const ids = meta.map(({ event }) => event.event_id).sort();
  check(
    'Meta received exactly one purchase for each consenting order',
    JSON.stringify(ids) === JSON.stringify([`purchase-${full.id}`, `purchase-${noGa.id}`].sort()),
    JSON.stringify(ids),
  );
  const m = meta.find(({ event }) => event.event_id === `purchase-${full.id}`);
  check(
    'Meta: e-mail hashed (trimmed, lowercase) and phone hashed with the country code',
    JSON.stringify(m?.event.user_data.em) === JSON.stringify([sha('tracking-test@example.com')]) &&
      JSON.stringify(m?.event.user_data.ph) === JSON.stringify([sha('573005550142')]),
    JSON.stringify(m?.event.user_data),
  );
  check(
    'Meta: no readable e-mail or phone anywhere in the request',
    !/tracking-test|3005550142|300 555/i.test(JSON.stringify(m?.request.body)),
    JSON.stringify(m?.request.body),
  );
  check(
    'Meta: value in major units, the shared event id and the website source',
    m?.event.custom_data.value === full.total / 100 && m?.event.action_source === 'website',
    JSON.stringify(m?.event),
  );

  // ---- No consent: nothing about those orders left the store.
  const wire = JSON.stringify([ga4.requests, graph.requests]);
  check(
    'no cookies and refused orders: neither GA4 nor Meta heard of them',
    !wire.includes(none.id) && !wire.includes(refused.id),
    `${none.id} ${refused.id}`,
  );

  // ---- Browser.
  await runBrowserFlows({ check, place, pay });
} finally {
  const restored = await post('/api/admin/settings/marketing', { values: original }, adminCookie);
  const restoredCheckout = await post(
    '/api/admin/settings/checkout',
    { values: originalCheckout },
    adminCookie,
  );
  console.log('settings restored:', restored.status, restoredCheckout.status);
  await ga4.close();
  await graph.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
