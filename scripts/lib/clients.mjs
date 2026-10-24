// Shared client helpers for scripts/*.mjs: slug rules, client config lookup, rate-limit allocation and Cloudflare credentials.
// The pure functions are exported on their own so they can be checked without any Cloudflare access.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'jsonc-parser';

/** Repository root (scripts/lib/ is two levels below it). */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Client slugs name folders, Workers, D1/R2/KV/queue resources and the analytics dataset,
 * so they stay lowercase, digits and dashes. Length 2 to 30 keeps Worker names inside Cloudflare's limits.
 */
export const SLUG_PATTERN = /^[a-z0-9-]{2,30}$/;

/** First rate-limit namespace base; every client gets three ids above its base (RL_AUTH, RL_FORMS, RL_API). */
export const RATE_LIMIT_FIRST_BASE = 1000;

/** Step between bases. Ten leaves room for the three ids and a few spares per client. */
export const RATE_LIMIT_STEP = 10;

/**
 * Reads and parses a JSONC file, failing loudly when it is missing.
 * @param {string} path Absolute path to the file.
 * @returns {any} Parsed JSON value.
 */
export function readJsonc(path) {
  if (!existsSync(path)) throw new Error(`Missing file: ${path}`);
  const errors = [];
  const value = parse(readFileSync(path, 'utf8'), errors, { allowTrailingComma: true });
  if (errors.length > 0) throw new Error(`Invalid JSONC in ${path} (offset ${errors[0].offset})`);
  return value;
}

/**
 * Tells whether a value is a valid client slug.
 * @param {unknown} slug Candidate slug.
 * @returns {boolean} True when the slug matches SLUG_PATTERN.
 */
export function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_PATTERN.test(slug);
}

/**
 * Returns the slug when valid, and throws a message that says what is allowed otherwise.
 * @param {unknown} slug Candidate slug.
 * @returns {string} The same slug.
 */
export function assertSlug(slug) {
  if (!isValidSlug(slug))
    throw new Error(`Invalid client slug "${slug}": use a-z, 0-9 and dashes, 2 to 30 characters.`);
  return slug;
}

/**
 * Picks the next rate-limit namespace base: the highest used base plus one step, or the first base when none is used.
 * Bases that are not positive integers (a broken or missing field) are ignored, so they never block allocation.
 * @param {unknown[]} usedBases Bases already written in clients/*\/client.jsonc.
 * @returns {number} The base for the new client.
 */
export function nextRateLimitBase(usedBases) {
  const valid = usedBases.filter((base) => Number.isInteger(base) && base >= 1);
  return valid.length === 0 ? RATE_LIMIT_FIRST_BASE : Math.max(...valid) + RATE_LIMIT_STEP;
}

/**
 * Lists the client folders that have a client.jsonc. `_default` is the fallback extension folder, not a client.
 * Invalid folder names are listed too, so the deploy of that folder fails loudly instead of being skipped.
 * @param {string} [clientsDir] Absolute path to the clients folder.
 * @returns {string[]} Sorted folder names.
 */
export function listClientSlugs(clientsDir = join(ROOT, 'clients')) {
  return readdirSync(clientsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_default')
    .filter((entry) => existsSync(join(clientsDir, entry.name, 'client.jsonc')))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Reads clients/<slug>/client.jsonc and checks that its slug matches the folder.
 * @param {string} slug Client slug (also the folder name).
 * @param {string} [clientsDir] Absolute path to the clients folder.
 * @returns {any} Parsed client configuration.
 */
export function readClient(slug, clientsDir = join(ROOT, 'clients')) {
  assertSlug(slug);
  const client = readJsonc(join(clientsDir, slug, 'client.jsonc'));
  if (client.slug !== slug)
    throw new Error(
      `clients/${slug}/client.jsonc has slug "${client.slug}"; the folder and the slug must match.`,
    );
  return client;
}

/**
 * Allocates the rate-limit base for a new client from the bases of the clients already on disk.
 * @param {string} [clientsDir] Absolute path to the clients folder.
 * @returns {number} The new base.
 */
export function allocateRateLimitBase(clientsDir = join(ROOT, 'clients')) {
  const bases = listClientSlugs(clientsDir).map((slug) =>
    Number(readJsonc(join(clientsDir, slug, 'client.jsonc')).rateLimitNamespaceBase),
  );
  return nextRateLimitBase(bases);
}

/**
 * Parses the KEY=VALUE lines of a .env file. Blank lines and # comments are skipped; one pair of matching quotes is removed.
 * Error messages name the key only, never the value.
 * @param {string} text File contents.
 * @returns {Record<string, string>} Parsed values.
 */
export function parseEnvFile(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) throw new Error('Invalid line in a .env file: expected KEY=VALUE.');
    let value = line.slice(eq + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    values[line.slice(0, eq).trim()] = value;
  }
  return values;
}

/**
 * Path of the per-client credentials file for clients with their own Cloudflare account.
 * @param {string} slug Client slug.
 * @returns {string} Absolute path to .secrets/<slug>.env (gitignored).
 */
export function envFilePath(slug) {
  return join(ROOT, '.secrets', `${slug}.env`);
}

/**
 * Builds the environment for Wrangler and npm child processes.
 * Clients without accountId use the login from `wrangler login`, so the environment is unchanged.
 * Clients with accountId take CLOUDFLARE_API_TOKEN from .secrets/<slug>.env. The token only goes into child
 * process environments; it is never printed or written to a tracked file.
 * @param {string} slug Client slug.
 * @param {string | null | undefined} accountId accountId from client.jsonc, or null for our own account.
 * @returns {NodeJS.ProcessEnv} Environment for the child process.
 */
export function cloudflareEnv(slug, accountId) {
  if (!accountId) return { ...process.env };
  const path = envFilePath(slug);
  if (!existsSync(path))
    throw new Error(`Client "${slug}" has its own account, but ${path} is missing (see docs/NEW_CLIENT.md).`);
  const file = parseEnvFile(readFileSync(path, 'utf8'));
  if (!file.CLOUDFLARE_API_TOKEN) throw new Error(`${path} has no CLOUDFLARE_API_TOKEN.`);
  if (file.CLOUDFLARE_ACCOUNT_ID && file.CLOUDFLARE_ACCOUNT_ID !== accountId)
    throw new Error(`${path} names a different account than clients/${slug}/client.jsonc.`);
  return {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: file.CLOUDFLARE_API_TOKEN,
  };
}

/** Cloudflare's published Turnstile test keys (1x, 2x and 3x series) all start like this; their widgets always pass. */
const TURNSTILE_TEST_KEY = /^[123]x0{20}/;

/**
 * Refuses a client whose Turnstile site key is one of Cloudflare's test keys, unless the client opts in. A test key makes the
 * bot check pass for any token, so a real store would have no protection on sign-in, checkout and password reset. The demo
 * store opts in with `"allowTestTurnstile": true` in its client.jsonc.
 * @param {any} client Parsed client configuration.
 * @throws {Error} When the key is a test key and the client has not opted in.
 */
export function assertRealTurnstileKey(client) {
  const key = String(client.vars?.TURNSTILE_SITE_KEY ?? '');
  if (TURNSTILE_TEST_KEY.test(key) && client.allowTestTurnstile !== true)
    throw new Error(
      `clients/${client.slug}/client.jsonc uses a Cloudflare test Turnstile key, which lets any bot pass. ` +
        'Create a Turnstile widget for the store, put its site key in vars.TURNSTILE_SITE_KEY and set its secret with ' +
        '`wrangler secret put TURNSTILE_SECRET_KEY` (a demo may set "allowTestTurnstile": true).',
    );
}
