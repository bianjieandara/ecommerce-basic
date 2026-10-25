// Signs in to a LOCAL store as the demo owner, creating the account the first time. Shared by the data script and the tests that need an
// admin session. The account file holds the owner's made-up credentials, and the cookie file is where the session is kept; both can be
// moved, so a second local store (another DOCS_STATE) does not overwrite the first one's cookie.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { post, TURNSTILE_TEST_TOKEN } from './shared.mjs';

/** Where the owner's made-up credentials are kept. */
export const ACCOUNT_FILE = '.wrangler/docs-admin.json';

/** Where the session cookie of the default local store is kept. */
export const COOKIE_FILE = '.wrangler/docs-cookie.txt';

/**
 * Signs in as the demo owner, creating the account the first time (the setup needs SETUP_TOKEN from .dev.vars, which is never printed).
 * @param cookieFile Where to write the session cookie.
 * @returns The session cookie header value.
 */
export async function ownerCookie(cookieFile = COOKIE_FILE) {
  mkdirSync('.wrangler', { recursive: true });
  const account = existsSync(ACCOUNT_FILE)
    ? JSON.parse(readFileSync(ACCOUNT_FILE, 'utf8'))
    : { email: 'maria@demo-store.test', password: randomBytes(15).toString('base64url') };
  writeFileSync(ACCOUNT_FILE, JSON.stringify(account));
  const vars = Object.fromEntries(
    readFileSync('.dev.vars', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
  );
  let response = await post('/api/admin/login', { ...account, turnstileToken: TURNSTILE_TEST_TOKEN });
  if (response.status !== 200) {
    response = await post('/api/admin/setup', {
      setupToken: vars.SETUP_TOKEN,
      name: 'Maria Rojas',
      email: account.email,
      password: account.password,
      locale: 'en',
    });
  }
  if (response.status !== 200) throw new Error(`Could not sign in: ${JSON.stringify(response.json)}`);
  const cookie = response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');
  writeFileSync(cookieFile, cookie);
  return cookie;
}
