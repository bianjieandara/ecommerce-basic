// Stage 18 on this machine: the whole WhatsApp flow of the LOCAL demo store against a fake Graph API (fake-graph.mjs), which applies
// the rules Meta documents. Templates are saved, submitted, reviewed and synced; an order's "shipped" update leaves with the tracking
// code and the order link; the invoice leaves as a PDF document; delivery statuses arrive through the signed webhook; and a message
// that is disabled, not approved, or not opted in is skipped and logged. It cannot prove what only Meta decides (review outcome,
// delivery to a handset): docs/TESTING_INTEGRATIONS.md lists those steps for a real test number.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:whatsapp
// The orders it creates use "whatsapp-test@example.com" and are removed at the end; the settings it changes are put back.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BASE, DEMO_WEBHOOK_VARS, post, sql, TURNSTILE_TEST_TOKEN } from '../docs/shared.mjs';
import { startFakeGraph } from './fake-graph.mjs';

const cookie = readFileSync('.wrangler/docs-cookie.txt', 'utf8');
const EMAIL = 'whatsapp-test@example.com';
const PHONE = '573005550142';
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
/** Polls until a condition holds (jobs batch for up to 5 seconds), or the time is up. */
async function until(condition, ms = 30000) {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (await condition()) return true;
    await wait(500);
  }
  return Boolean(await condition());
}
const admin = (path, body) => post(path, body, cookie);
const good = (r) => r.status === 200 && r.json?.ok === true;
const brief = (r) => `${r.status} ${JSON.stringify(r.json?.error ?? r.json?.data).slice(0, 220)}`;
const one = (query) => sql(query)[0];
const group = (name) => JSON.parse(one(`SELECT value_json AS v FROM settings WHERE group_key = '${name}'`).v);

const DEFAULT_BODIES = {
  order_shipped: {
    es: 'Hola {{1}}, tu pedido {{2}} ya va en camino. Código de seguimiento: {{3}}.',
    en: 'Hi {{1}}, your order {{2}} is on its way. Tracking code: {{3}}.',
  },
  invoice_issued: {
    es: 'Hola {{1}}, adjuntamos la factura {{2}} de tu pedido. Gracias por comprar con nosotros.',
    en: 'Hi {{1}}, the invoice {{2}} for your order is attached. Thank you for shopping with us.',
  },
};

let placedAt = Date.now();
let placed = 0;
/** Places an order from a customer who opted in to WhatsApp, keeping under the form rate limit (10 a minute). */
async function place(whatsappOptIn = true) {
  placed += 1;
  if (placed > 7) {
    await wait(Math.max(0, 62000 - (Date.now() - placedAt)));
    placedAt = Date.now();
    placed = 1;
  }
  const body = {
    locale: 'en',
    items: [{ variantId: 'var-bottle', quantity: 1 }],
    customer: { name: 'Wanda Tester', email: EMAIL, phone: '+57 300 555 0142' },
    whatsappOptIn,
    shippingMethodId: 'ship-pickup',
    address: null,
    paymentMethod: 'bank_transfer',
    note: '',
    billing: null,
    attribution: {},
    turnstileToken: TURNSTILE_TEST_TOKEN,
  };
  let answer = await post('/api/checkout', body);
  if (answer.status === 429) {
    await wait(62000);
    placedAt = Date.now();
    placed = 1;
    answer = await post('/api/checkout', body);
  }
  return Number(/orders\/(\d+)/.exec(answer.json?.data?.orderPath ?? '')?.[1] ?? 0);
}
const status = (n, to, extra = {}) =>
  admin(`/api/admin/orders/${n}/status`, { to, notify: true, trackingCode: '', note: '', ...extra });
/** The WhatsApp log rows of an order, by template key. */
const rows = (orderNumber, key) =>
  sql(
    `SELECT l.status, l.error, l.recipient, l.subject, l.provider_message_id AS wamid FROM notification_log l JOIN orders o ON o.id = l.order_id WHERE o.number = ${orderNumber} AND l.channel = 'whatsapp' AND l.template_key = '${key}' ORDER BY l.created_at`,
  );
const sentToFake = (fake, since = 0) =>
  fake.requests
    .slice(since)
    .filter((r) => r.method === 'POST' && /\/messages$/.test(r.path) && r.status === 200);

// The demo store ships these two messages as saved defaults (disabled, not submitted). They are put back as they were at the end.
const KEYS = ['order_shipped', 'invoice_issued'];
const snapshot = Object.fromEntries(
  sql(
    `SELECT key, meta_name, is_enabled, body_json, params_json, button_param_path, remote_status_json FROM whatsapp_templates WHERE key IN ('order_shipped', 'invoice_issued')`,
  ).map((r) => [r.key, r]),
);
for (const key of KEYS) {
  if (
    !snapshot[key] ||
    snapshot[key].is_enabled ||
    !snapshot[key].meta_name.startsWith('store_') ||
    snapshot[key].remote_status_json !== '{}'
  ) {
    console.error(
      `The saved template ${key} is not the untouched default (an interrupted run, or an edit in the admin): reset it before testing.`,
    );
    process.exit(2);
  }
}
/** Puts a template back: the review state and name first (the approved lock would refuse a rename), then its content. */
async function restoreTemplate(key) {
  const was = snapshot[key];
  sql(
    `UPDATE whatsapp_templates SET meta_name = '${was.meta_name}', remote_status_json = '{}' WHERE key = '${key}'`,
  );
  await admin(`/api/admin/whatsapp/${key}`, {
    metaName: was.meta_name,
    body: JSON.parse(was.body_json),
    params: JSON.parse(was.params_json),
    buttonPath: was.button_param_path,
    enabled: Boolean(was.is_enabled),
  });
}
const fake = await startFakeGraph();
const originals = { whatsapp: group('whatsapp') };
const originalStock = one(`SELECT stock AS s FROM product_variants WHERE id = 'var-bottle'`).s;
sql(`UPDATE product_variants SET stock = 200, track_inventory = 1 WHERE id = 'var-bottle'`);
const saveSettings = (name, values) => admin(`/api/admin/settings/${name}`, { values });

try {
  // ======================================================================================================== connection
  console.log('connection');
  check(
    'the signed webhook handshake answers the challenge',
    await (async () => {
      const response = await fetch(
        `${BASE}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${DEMO_WEBHOOK_VARS.WHATSAPP_VERIFY_TOKEN}&hub.challenge=424242`,
      );
      return response.status === 200 && (await response.text()) === '424242';
    })(),
  );
  check(
    'a wrong verify token gets 403',
    (await fetch(`${BASE}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`))
      .status === 403,
  );
  check(
    'WhatsApp is turned on in settings for this run',
    good(await saveSettings('whatsapp', { ...originals.whatsapp, enabled: true, alertsNumber: '' })),
  );

  // ================================================================================== not approved, not enabled: skipped
  console.log('skipped messages');
  const noTemplate = await place();
  check('an order is placed by a customer who opted in', noTemplate > 0);
  await status(noTemplate, 'paid');
  await status(noTemplate, 'processing');
  await status(noTemplate, 'shipped', { trackingCode: 'TRK-SKIP-1' });
  check(
    '"shipped" with no template saved is skipped and logged as disabled',
    await until(() => rows(noTemplate, 'order_shipped')[0]?.status === 'skipped'),
    JSON.stringify(rows(noTemplate, 'order_shipped')),
  );
  check(
    'the skip says why',
    /disabled/i.test(rows(noTemplate, 'order_shipped')[0]?.error ?? ''),
    rows(noTemplate, 'order_shipped')[0]?.error,
  );
  check('nothing reached Meta', sentToFake(fake).length === 0);

  // ===================================================================================== saving and submitting templates
  console.log('templates');
  const saved = await admin('/api/admin/whatsapp/order_shipped', {
    metaName: 'wa_test_order_shipped',
    body: DEFAULT_BODIES.order_shipped,
    params: ['customer.firstName', 'order.number', 'order.trackingCode'],
    buttonPath: 'order.url',
    enabled: true,
  });
  check('a template with the right variables is saved', good(saved), brief(saved));
  const badBody = await admin('/api/admin/whatsapp/order_shipped', {
    metaName: 'wa_test_order_shipped',
    body: { es: '{{1}} tu pedido va en camino {{2}}', en: DEFAULT_BODIES.order_shipped.en },
    params: ['customer.firstName', 'order.number'],
    buttonPath: 'order.url',
    enabled: true,
  });
  check(
    'a body that starts or ends with a variable is refused before it reaches Meta',
    !good(badBody) && badBody.status < 500,
    brief(badBody),
  );
  const mismatch = await admin('/api/admin/whatsapp/order_shipped', {
    metaName: 'wa_test_order_shipped',
    body: DEFAULT_BODIES.order_shipped,
    params: ['customer.firstName'],
    buttonPath: 'order.url',
    enabled: true,
  });
  check(
    'a body with more variables than mapped parameters is refused',
    !good(mismatch) && mismatch.status < 500,
    brief(mismatch),
  );
  {
    const unknown = await admin('/api/admin/whatsapp/no_such_message', { metaName: 'x' });
    check(
      'an unknown template key is a 4xx, never a 500',
      unknown.status >= 400 && unknown.status < 500,
      brief(unknown),
    );
  }

  const submitted = await admin('/api/admin/whatsapp/order_shipped/submit', {});
  check(
    'submit to Meta succeeds for both languages',
    good(submitted) && submitted.json.data.results.every((r) => r.outcome !== 'failed'),
    brief(submitted),
  );
  const created = fake.requests.filter((r) => r.method === 'POST' && /message_templates$/.test(r.path));
  check(
    'one template per language was created under the same name',
    created.length === 2 && new Set(created.map((r) => r.body?.language)).size === 2,
    JSON.stringify(created.map((r) => r.body?.language)),
  );
  const first = created[0]?.body;
  check(
    'it is a UTILITY template with a sample value for each variable',
    first?.category === 'UTILITY' &&
      first.components.find((c) => c.type === 'BODY')?.example?.body_text?.[0]?.length === 3,
    JSON.stringify(first?.components?.find((c) => c.type === 'BODY')),
  );
  check(
    'its URL button ends in {{1}} with an example',
    (() => {
      const button = first?.components?.find((c) => c.type === 'BUTTONS')?.buttons?.[0];
      return button?.type === 'URL' && button.url.endsWith('{{1}}') && Boolean(button.example?.[0]);
    })(),
    JSON.stringify(first?.components?.find((c) => c.type === 'BUTTONS')),
  );
  check(
    'the bearer token travels with every request',
    fake.requests.every((r) => r.status !== 401),
  );

  const unapproved = await place();
  await status(unapproved, 'paid');
  await status(unapproved, 'processing');
  await status(unapproved, 'shipped', { trackingCode: 'TRK-PEND-1' });
  check(
    'while Meta has not approved it, "shipped" is skipped and logged',
    await until(() => rows(unapproved, 'order_shipped')[0]?.status === 'skipped'),
    JSON.stringify(rows(unapproved, 'order_shipped')),
  );
  check(
    'the skip names the status',
    /PENDING/.test(rows(unapproved, 'order_shipped')[0]?.error ?? ''),
    rows(unapproved, 'order_shipped')[0]?.error,
  );
  check(
    'the edit of a submitted template is still allowed until approval',
    good(
      await admin('/api/admin/whatsapp/order_shipped', {
        metaName: 'wa_test_order_shipped',
        body: DEFAULT_BODIES.order_shipped,
        params: ['customer.firstName', 'order.number', 'order.trackingCode'],
        buttonPath: 'order.url',
        enabled: true,
      }),
    ),
  );

  // ============================================================================================================== review
  console.log('review and sync');
  const stillPending = await admin('/api/admin/whatsapp/order_shipped/sync', {});
  check(
    'sync while Meta is still reviewing reports PENDING',
    good(stillPending) && JSON.stringify(stillPending.json.data).includes('PENDING'),
    brief(stillPending),
  );
  fake.review('wa_test_order_shipped', 'APPROVED');
  const synced = await admin('/api/admin/whatsapp/order_shipped/sync', {});
  check(
    'sync after approval reports APPROVED in both languages',
    good(synced) && (JSON.stringify(synced.json.data).match(/APPROVED/g) ?? []).length >= 2,
    brief(synced),
  );
  const lockedEdit = await admin('/api/admin/whatsapp/order_shipped', {
    metaName: 'wa_test_order_shipped',
    body: {
      es: 'Hola {{1}}, otro texto para {{2}} con {{3}} listo.',
      en: 'Hi {{1}}, other text for {{2}} with {{3}} ready.',
    },
    params: ['customer.firstName', 'order.number', 'order.trackingCode'],
    buttonPath: 'order.url',
    enabled: true,
  });
  check(
    'an approved template cannot be edited under the same name',
    !good(lockedEdit) && lockedEdit.status < 500,
    brief(lockedEdit),
  );

  // ==================================================================================== shipped, with tracking and link
  console.log('shipped message');
  const shipped = await place();
  await status(shipped, 'paid');
  await status(shipped, 'processing');
  const before = fake.requests.length;
  await status(shipped, 'shipped', { trackingCode: 'TRK-WA-4711' });
  check(
    'the shipped message reaches Meta',
    await until(() => sentToFake(fake, before).length > 0),
    JSON.stringify(rows(shipped, 'order_shipped')),
  );
  const message = sentToFake(fake, before)[0]?.body;
  check('it goes to the customer number with the country code', message?.to === PHONE, message?.to);
  check(
    "it uses the approved template in the customer's language",
    message?.template?.name === 'wa_test_order_shipped' && message.template.language.code === 'en',
    JSON.stringify(message?.template?.language),
  );
  const params = message?.template?.components
    ?.find((c) => c.type === 'body')
    ?.parameters?.map((p) => p.text);
  check(
    'the body carries first name, order number and the tracking code',
    params?.[0] === 'Wanda' && params?.[1] === String(shipped) && params?.[2] === 'TRK-WA-4711',
    JSON.stringify(params),
  );
  const button = message?.template?.components?.find((c) => c.type === 'button')?.parameters?.[0]?.text;
  check(
    'the button carries the order page path with its key',
    Boolean(button) && button.includes(String(shipped)) && button.includes('key='),
    button,
  );
  const open = button ? await fetch(`${BASE}${button.startsWith('/') ? '' : '/'}${button}`) : null;
  check('that link opens the order page', open?.status === 200, String(open?.status));
  const sentRow = rows(shipped, 'order_shipped')[0];
  check(
    'the log row is sent, with the WhatsApp message id',
    (await until(() => rows(shipped, 'order_shipped')[0]?.status === 'sent')) &&
      /^wamid\./.test(rows(shipped, 'order_shipped')[0]?.wamid ?? ''),
    JSON.stringify(sentRow),
  );
  check(
    'the log subject is the rendered text',
    /TRK-WA-4711/.test(rows(shipped, 'order_shipped')[0]?.subject ?? ''),
    rows(shipped, 'order_shipped')[0]?.subject,
  );

  // ============================================================================================= delivery statuses
  console.log('delivery statuses');
  const wamid = rows(shipped, 'order_shipped')[0]?.wamid;
  const deliver = async (state, secret = DEMO_WEBHOOK_VARS.META_APP_SECRET) => {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '0',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                statuses: [
                  {
                    id: wamid,
                    status: state,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    recipient_id: PHONE,
                    ...(state === 'failed'
                      ? { errors: [{ code: 131026, title: 'Message undeliverable' }] }
                      : {}),
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const response = await fetch(`${BASE}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
      },
      body,
    });
    return response.status;
  };
  check(
    'a status with a wrong signature gets 403 and changes nothing',
    (await deliver('delivered', 'wrong-secret')) === 403 &&
      rows(shipped, 'order_shipped')[0]?.status === 'sent',
  );
  check(
    '"delivered" moves the log row to delivered',
    (await deliver('delivered')) === 200 && rows(shipped, 'order_shipped')[0]?.status === 'delivered',
  );
  check(
    '"read" moves it to read',
    (await deliver('read')) === 200 && rows(shipped, 'order_shipped')[0]?.status === 'read',
  );
  check(
    'a late "failed" after "read" changes nothing',
    (await deliver('failed')) === 200 && rows(shipped, 'order_shipped')[0]?.status === 'read',
  );

  // ==================================================================================================== invoice PDF
  console.log('invoice as a document');
  check(
    'the invoice template is saved with a document header',
    good(
      await admin('/api/admin/whatsapp/invoice_issued', {
        metaName: 'wa_test_invoice_issued',
        body: DEFAULT_BODIES.invoice_issued,
        params: ['customer.firstName', 'invoice.number'],
        buttonPath: null,
        enabled: true,
      }),
    ),
  );
  const submittedInvoice = await admin('/api/admin/whatsapp/invoice_issued/submit', {});
  check(
    'it is submitted (the document example goes through the resumable upload)',
    good(submittedInvoice),
    brief(submittedInvoice),
  );
  check(
    'the upload session and the file were requested',
    fake.requests.some((r) => /\/uploads$/.test(r.path)) &&
      fake.requests.some((r) => r.method === 'POST' && r.path.startsWith('/') && /upload:/.test(r.path)),
  );
  const header = fake.requests
    .filter((r) => /message_templates$/.test(r.path) && r.method === 'POST')
    .at(-1)
    ?.body?.components?.find((c) => c.type === 'HEADER');
  check(
    'the template has a DOCUMENT header with an example handle',
    header?.format === 'DOCUMENT' && Boolean(header.example?.header_handle?.[0]),
    JSON.stringify(header),
  );
  fake.review('wa_test_invoice_issued', 'APPROVED');
  check('sync approves it', good(await admin('/api/admin/whatsapp/invoice_issued/sync', {})));

  const invoiced = await place();
  const mark = fake.requests.length;
  await status(invoiced, 'paid');
  check(
    'the invoice message reaches Meta',
    await until(() => sentToFake(fake, mark).some((r) => r.body.template.name === 'wa_test_invoice_issued')),
    JSON.stringify(rows(invoiced, 'invoice_issued')),
  );
  const media = fake.requests.slice(mark).find((r) => /\/media$/.test(r.path));
  check(
    'the PDF was uploaded to Meta first, as application/pdf',
    media?.file?.type === 'application/pdf' && media.file.startsWith === '%PDF-' && media.file.bytes > 500,
    JSON.stringify(media?.file),
  );
  const invoiceMessage = sentToFake(fake, mark).find(
    (r) => r.body.template.name === 'wa_test_invoice_issued',
  )?.body;
  const document = invoiceMessage?.template?.components?.find((c) => c.type === 'header')?.parameters?.[0];
  check(
    'the message header references that upload as a document with a file name',
    document?.type === 'document' &&
      Boolean(document.document?.id) &&
      /\.pdf$/i.test(document.document?.filename ?? ''),
    JSON.stringify(document),
  );
  const invoiceParams = invoiceMessage?.template?.components
    ?.find((c) => c.type === 'body')
    ?.parameters?.map((p) => p.text);
  check(
    'its body names the customer and the invoice number',
    invoiceParams?.[0] === 'Wanda' && /\d/.test(invoiceParams?.[1] ?? ''),
    JSON.stringify(invoiceParams),
  );

  // ============================================================================================== opt-in and switches
  console.log('opt-in and switches');
  const noOptIn = await place(false);
  const markB = fake.requests.length;
  await status(noOptIn, 'paid');
  await status(noOptIn, 'processing');
  await status(noOptIn, 'shipped', { trackingCode: 'TRK-NOOPT' });
  await wait(9000);
  check(
    'a customer who did not opt in gets no WhatsApp message',
    sentToFake(fake, markB).length === 0 && rows(noOptIn, 'order_shipped').length === 0,
    JSON.stringify(rows(noOptIn, 'order_shipped')),
  );

  check(
    'the template is switched off',
    good(
      await admin('/api/admin/whatsapp/order_shipped', {
        metaName: 'wa_test_order_shipped',
        body: DEFAULT_BODIES.order_shipped,
        params: ['customer.firstName', 'order.number', 'order.trackingCode'],
        buttonPath: 'order.url',
        enabled: false,
      }),
    ),
  );
  const switchedOff = await place();
  const markC = fake.requests.length;
  await status(switchedOff, 'paid');
  await status(switchedOff, 'processing');
  await status(switchedOff, 'shipped', { trackingCode: 'TRK-OFF' });
  check(
    'a disabled template is skipped and logged',
    await until(() => rows(switchedOff, 'order_shipped')[0]?.status === 'skipped'),
    JSON.stringify(rows(switchedOff, 'order_shipped')),
  );
  check(
    'and nothing reached Meta for it',
    sentToFake(fake, markC).filter((r) => r.body.template.name === 'wa_test_order_shipped').length === 0,
  );

  check(
    'WhatsApp is turned off in settings',
    good(await saveSettings('whatsapp', { ...originals.whatsapp, enabled: false })),
  );
  const markD = fake.requests.length;
  const allOff = await place();
  await status(allOff, 'paid');
  await wait(9000);
  check('with WhatsApp off, nothing is sent at all', sentToFake(fake, markD).length === 0);

  // ===================================================================================== a send test, and a Meta error
  console.log('send test and errors');
  check(
    'WhatsApp is turned on again',
    good(await saveSettings('whatsapp', { ...originals.whatsapp, enabled: true })),
  );
  fake.review('wa_test_order_shipped', 'REJECTED', 'INVALID_FORMAT');
  const rejected = await admin('/api/admin/whatsapp/order_shipped/sync', {});
  check(
    'a rejection and its reason are shown after sync',
    good(rejected) &&
      JSON.stringify(rejected.json.data).includes('REJECTED') &&
      JSON.stringify(rejected.json.data).includes('INVALID_FORMAT'),
    brief(rejected),
  );
  const testSend = await admin('/api/admin/whatsapp/invoice_issued/test', {});
  check('a send test answers without a server error', testSend.status < 500, brief(testSend));
} finally {
  // ============================================================================================================ cleanup
  await saveSettings('whatsapp', originals.whatsapp).catch(() => null);
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
  sql(`DELETE FROM notification_log WHERE recipient LIKE 'whatsapp-test%'`);
  for (const key of KEYS) await restoreTemplate(key).catch(() => null);
  sql(`UPDATE product_variants SET stock = ${originalStock} WHERE id = 'var-bottle'`);
  await fake.close();
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
if (failures.length > 0) {
  console.log('Failed:\n - ' + failures.join('\n - '));
  process.exitCode = 1;
}
