// Helpers shared by the documentation scripts: which store they talk to, SQL on its demo database, and JSON calls.
import { execSync } from 'node:child_process';

/** The demo store (started by `npm run docs:store`). */
export const BASE = process.env.DOCS_BASE ?? 'http://localhost:4400';

/** Folder where wrangler keeps the demo store's database, so it never mixes with the development one. */
export const STATE = process.env.DOCS_STATE ?? '.wrangler/docs-state';

/**
 * Fixed, made-up WhatsApp webhook secrets of the local demo store. They are not credentials: they only let scripts/test/webhooks.mjs
 * sign calls the demo store accepts, without a Meta account and without touching .dev.vars. The store starts with them (store.mjs).
 */
export const DEMO_WEBHOOK_VARS = {
  META_APP_SECRET: 'local-test-app-secret',
  WHATSAPP_VERIFY_TOKEN: 'local-test-verify-token',
};

/**
 * Where the demo store reaches "Meta": the fake Graph API of scripts/test/fake-graph.mjs, started by scripts/test/whatsapp.mjs. The store
 * is given this address on its command line, which wins over .dev.vars, so the local demo never calls Meta even with real keys there.
 */
export const DEMO_GRAPH_VARS = {
  META_GRAPH_BASE_URL: `http://localhost:${process.env.DOCS_GRAPH_PORT ?? 5801}`,
  META_APP_ID: 'local-test-app-id',
};

/**
 * What a local store started with `--tracking` (scripts/docs/store.mjs) needs to send purchases: a made-up GA4 API secret and a
 * made-up Conversions API token, with the Graph version they require, and the address of the fake GA4 (scripts/test/fake-ga4.mjs).
 * The Graph address is DEMO_GRAPH_VARS. Not credentials; only for scripts/test/tracking.mjs.
 */
export const DEMO_TRACKING_VARS = {
  GA4_API_SECRET: 'local-test-ga4-secret',
  GA4_MP_BASE_URL: `http://localhost:${process.env.DOCS_GA4_PORT ?? 5830}`,
  META_CAPI_TOKEN: 'local-test-capi-token',
  META_GRAPH_VERSION: 'v21.0',
};

/** Test token the Turnstile test keys accept. */
export const TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

/**
 * Shared demo login and PayPal buyer of a local demo store started with `--demo` (scripts/docs/store.mjs). Test values only: they
 * open nothing outside this machine, and the demo store never sends mail.
 */
export const DEMO_TEST_VARS = {
  DEMO_LOGIN_EMAIL: 'try@demo-store.test',
  DEMO_LOGIN_PASSWORD: 'demo-login-test-2026',
  DEMO_PAYPAL_BUYER_EMAIL: 'buyer@demo-store.test',
  DEMO_PAYPAL_BUYER_PASSWORD: 'buyer-test-2026',
};

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) {
  throw new Error(`Refusing to use ${BASE}: the documentation scripts only talk to a store on this machine.`);
}

/**
 * Runs SQL on the demo database and returns the rows of the first statement.
 * @param command SQL text.
 * @returns The rows.
 */
export function sql(command) {
  const flat = command.replace(/\s+/g, ' ').trim();
  const out = execSync(
    `npx wrangler d1 execute DB --local --persist-to ${STATE} --json --command "${flat}"`,
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  return JSON.parse(out.slice(out.search(/^\[/m)))[0].results;
}

/**
 * Calls the demo store with a JSON body.
 * @param path URL path.
 * @param body JSON body.
 * @param cookie Admin session cookie, for admin calls.
 * @returns Status, headers and the parsed body.
 */
export async function post(path, body, cookie) {
  const response = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    headers: response.headers,
    json: await response.json().catch(() => null),
  };
}
