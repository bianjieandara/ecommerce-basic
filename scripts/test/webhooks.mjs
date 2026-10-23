// Sends signed webhook calls to a LOCAL store, so the signature checks and the status updates can be tested without a
// payment or Meta account. dLocal Go calls are signed with the sandbox keys in .dev.vars (never printed); WhatsApp calls use the
// fixed test secrets of the demo store (shared.mjs). It refuses any store that is not on this machine.
//
// Usage: node scripts/test/webhooks.mjs <case> [arguments]
//   dlocalgo <payment_id> [--bad]     dLocal Go notification (HMAC of API key + body, with the secret key)
//   whatsapp-verify [--bad]           Meta subscription handshake (hub.challenge) with the verify token
//   whatsapp-status <id> <status>     Meta delivery status (delivered | read | failed) for a log row; adds the row first
//                                     when none exists. Add --bad to sign with the wrong secret.
//   paypal                            explains why PayPal cannot be simulated locally
// A correct call answers 200; a call signed with the wrong key must be refused (400 or 403), and --bad checks that.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BASE, DEMO_WEBHOOK_VARS, sql } from '../docs/shared.mjs';

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((item) => item.startsWith('--')));
const args = rest.filter((item) => !item.startsWith('--'));
const bad = flags.has('--bad');

/**
 * Reads the local secrets file.
 * @returns Names and values of .dev.vars.
 */
function devVars() {
  return Object.fromEntries(
    readFileSync('.dev.vars', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.startsWith('#'))
      .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
  );
}

/**
 * Takes a secret from .dev.vars, or stops with a clear message when it is missing.
 * @param vars Values of .dev.vars.
 * @param name Variable name.
 * @returns The value.
 */
function need(vars, name) {
  if (!vars[name]) throw new Error(`${name} is not set in .dev.vars`);
  return vars[name];
}

/**
 * Prints the answer of the store and says whether it is what the case expects.
 * @param response The store's response.
 * @param expectRefused True when the call was signed wrongly on purpose.
 */
async function report(response, expectRefused) {
  const text = (await response.text()).slice(0, 200);
  const refused = response.status === 400 || response.status === 403;
  // dLocal Go: a made-up payment id passes the signature check and then fails the lookup (502), which is what a retry needs.
  const unknownPayment = !expectRefused && response.status === 502 && text.includes('PAYMENT_PROVIDER_ERROR');
  const ok = expectRefused ? refused : response.status === 200 || unknownPayment;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${response.status}  ${unknownPayment ? 'signature accepted; dLocal Go does not know this payment id, so the store answers an error and dLocal Go would retry' : text}`,
  );
  process.exitCode = ok ? 0 : 1;
}

if (command === 'dlocalgo') {
  const vars = devVars();
  const paymentId = args[0] ?? 'DP-0000';
  const body = JSON.stringify({ payment_id: paymentId });
  const secret = bad ? 'not-the-secret-key' : need(vars, 'DLOCALGO_SECRET_KEY');
  // dLocal Go signs the API key followed by the raw body, with the secret key (docs.dlocalgo.com, Notifications).
  const signature = createHmac('sha256', secret)
    .update(need(vars, 'DLOCALGO_API_KEY') + body)
    .digest('hex');
  const response = await fetch(`${BASE}/api/webhooks/dlocalgo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `V2-HMAC-SHA256, Signature: ${signature}` },
    body,
  });
  // A real payment id makes the store ask dLocal Go for its status and apply it. An unknown id passes the signature check
  // and then fails the lookup with an error status, which is exactly what makes dLocal Go retry.
  await report(response, bad);
} else if (command === 'whatsapp-verify') {
  const token = bad ? 'wrong-token' : DEMO_WEBHOOK_VARS.WHATSAPP_VERIFY_TOKEN;
  const challenge = String(Math.floor(Math.random() * 1e9));
  const response = await fetch(
    `${BASE}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=${challenge}`,
  );
  const text = await response.text();
  const ok = bad ? response.status === 403 : response.status === 200 && text === challenge;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${response.status}  ${bad ? '' : 'answer is the challenge: ' + (text === challenge)}`,
  );
  process.exitCode = ok ? 0 : 1;
} else if (command === 'whatsapp-status') {
  const [id = `wamid.TEST${Date.now()}`, status = 'delivered'] = args;
  const now = new Date().toISOString();
  if (!sql(`SELECT id FROM notification_log WHERE provider_message_id = '${id}'`)[0]) {
    sql(
      `INSERT INTO notification_log (id, channel, template_key, recipient, status, provider_message_id, created_at, updated_at) VALUES ('test-${Date.now()}', 'whatsapp', 'order_shipped', '+57 300 555 0100', 'sent', '${id}', '${now}', '${now}')`,
    );
    console.log(`added a "sent" WhatsApp log row for ${id}`);
  }
  // The shape of a Meta status delivery (developers.facebook.com, WhatsApp webhooks reference, messages > statuses).
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
              metadata: { display_phone_number: '15550000000', phone_number_id: '0' },
              statuses: [
                {
                  id,
                  status,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: '573005550100',
                  ...(status === 'failed'
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
  const secret = bad ? 'not-the-app-secret' : DEMO_WEBHOOK_VARS.META_APP_SECRET;
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const response = await fetch(`${BASE}/api/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body,
  });
  await report(response, bad);
  if (!bad) {
    const row = sql(`SELECT status, error FROM notification_log WHERE provider_message_id = '${id}'`)[0];
    console.log(`log row is now: ${row?.status}${row?.error ? ' (' + row.error + ')' : ''}`);
  }
} else if (command === 'paypal') {
  console.log(
    'PayPal events cannot be faked locally: the store asks PayPal to verify each signature, and PayPal refuses mock events.\n' +
      'Test PayPal with a sandbox buyer (docs/TESTING.md, "PayPal") and, for webhooks, with a public URL and the dashboard simulator.',
  );
} else {
  console.log(
    'Usage: node scripts/test/webhooks.mjs dlocalgo <payment_id> | whatsapp-verify | whatsapp-status <id> <status> | paypal   [--bad]',
  );
  process.exitCode = 1;
}
