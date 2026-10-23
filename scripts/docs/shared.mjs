// Helpers shared by the documentation scripts: which store they talk to, SQL on its demo database, and JSON calls.
import { execSync } from 'node:child_process';

/** The demo store (started by `npm run docs:store`). */
export const BASE = process.env.DOCS_BASE ?? 'http://localhost:4400';

/** Folder where wrangler keeps the demo store's database, so it never mixes with the development one. */
export const STATE = process.env.DOCS_STATE ?? '.wrangler/docs-state';

/** Test token the Turnstile test keys accept. */
export const TURNSTILE_TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

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
