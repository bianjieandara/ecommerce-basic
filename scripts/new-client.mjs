// Provisions one client: D1 database, KV namespace, queues (with DLQ) and R2 bucket, then writes clients/<slug>/client.jsonc.
// Usage: node scripts/new-client.mjs <slug> [--account-id <32-hex>]
// Without --account-id the resources go to the account of `wrangler login`. With it, the client gets its own account and
// the token is read from .secrets/<slug>.env (see docs/NEW_CLIENT.md).
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, allocateRateLimitBase, assertSlug, cloudflareEnv } from './lib/clients.mjs';
import { createIfMissing, runStep } from './lib/run.mjs';

const DEFAULT_CRON = '*/15 * * * *';
const ACCOUNT_ID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * Reads the command line: one slug and an optional --account-id.
 * @param {string[]} argv Arguments after the script name.
 * @returns {{ slug: string, accountId: string | null }} Parsed values; the slug is validated.
 */
export function parseArgs(argv) {
  const flag = argv.indexOf('--account-id');
  const accountId = flag === -1 ? null : (argv[flag + 1] ?? null);
  if (accountId !== null && !ACCOUNT_ID_PATTERN.test(accountId))
    throw new Error('--account-id must be the 32-character hex id of the Cloudflare account.');
  const positional = argv.filter((arg, i) => !arg.startsWith('--') && (flag === -1 || i !== flag + 1));
  if (positional.length !== 1)
    throw new Error('Usage: node scripts/new-client.mjs <slug> [--account-id <32-hex>]');
  return { slug: assertSlug(positional[0]), accountId };
}

/**
 * Extracts a resource id from Wrangler's create output, or fails with a clear message.
 * @param {string} output Wrangler output.
 * @param {RegExp} pattern Pattern with one capture group.
 * @param {string} label Human-readable resource name for the error.
 * @returns {string} The id.
 */
export function parseId(output, pattern, label) {
  const match = output.match(pattern);
  if (!match || !match[1]) throw new Error(`Could not read the ${label} id from wrangler output:\n${output}`);
  return match[1];
}

/**
 * Runs a Wrangler command that prints JSON (possibly after a banner) and parses the array.
 * @param {string[]} args Arguments after `npx wrangler`.
 * @param {NodeJS.ProcessEnv} env Environment for the child process.
 * @returns {any[]} Parsed array.
 */
function listJson(args, env) {
  const result = runStep({ command: 'npx', args: ['wrangler', ...args], env, capture: true });
  if (!result.ok) throw new Error(`wrangler ${args.join(' ')} failed:\n${result.output}`);
  const { output } = result;
  return JSON.parse(output.slice(output.indexOf('['), output.lastIndexOf(']') + 1));
}

/**
 * Returns the D1 database id, creating the database first when it does not exist.
 * @param {string} name Database name, for example "demo-db".
 * @param {NodeJS.ProcessEnv} env Environment for the child process.
 * @returns {string} Database id.
 */
export function ensureD1(name, env) {
  const found = listJson(['d1', 'list', '--json'], env).find((db) => db.name === name);
  if (found) return found.uuid ?? found.id;
  const result = runStep({ command: 'npx', args: ['wrangler', 'd1', 'create', name], env, capture: true });
  if (!result.ok) throw new Error(`wrangler d1 create ${name} failed:\n${result.output}`);
  return parseId(result.output, /database_id["']?\s*[:=]\s*"([^"]+)"/, 'D1');
}

/**
 * Returns the KV namespace id, creating the namespace first when it does not exist.
 * `wrangler kv namespace create <name>` uses the name as the exact title, so the match is exact too: a suffix match
 * could attach another client's namespace to this client.
 * @param {string} title Namespace title, for example "demo-cache".
 * @param {NodeJS.ProcessEnv} env Environment for the child process.
 * @returns {string} Namespace id.
 */
export function ensureKv(title, env) {
  const found = listJson(['kv', 'namespace', 'list'], env).find((ns) => ns.title === title);
  if (found) return found.id;
  const result = runStep({
    command: 'npx',
    args: ['wrangler', 'kv', 'namespace', 'create', title],
    env,
    capture: true,
  });
  if (!result.ok) throw new Error(`wrangler kv namespace create ${title} failed:\n${result.output}`);
  return parseId(result.output, /\bid["']?\s*[:=]\s*"([0-9a-f]{32})"/, 'KV');
}

/**
 * Builds the client.jsonc object for a freshly provisioned client. Defaults are safe for a first run: sandbox payments,
 * no custom domain, and the placeholder site URL until the owner sets the real one.
 * @param {object} p Provisioned values.
 * @returns {object} Client configuration.
 */
export function buildClientConfig({ slug, accountId, d1Id, kvId, rateLimitNamespaceBase }) {
  return {
    slug,
    workerName: `${slug}-store`,
    accountId,
    d1: { name: `${slug}-db`, id: d1Id },
    r2: { bucket: `${slug}-media` },
    kv: { id: kvId },
    queue: { name: `${slug}-jobs`, dlq: `${slug}-jobs-dlq` },
    analyticsDataset: `${slug.replace(/-/g, '_')}_events`,
    rateLimitNamespaceBase,
    cron: DEFAULT_CRON,
    customDomains: [],
    vars: {
      PUBLIC_SITE_URL: 'http://localhost:4321',
      EMAIL_FROM: 'Store <orders@example.com>',
      PAYPAL_ENV: 'sandbox',
      DLOCALGO_ENV: 'sandbox',
      TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      PUBLIC_MEDIA_BASE_URL: '',
      WHATSAPP_PHONE_NUMBER_ID: '',
      WHATSAPP_WABA_ID: '',
      META_GRAPH_VERSION: '',
    },
  };
}

/** CLI entry: provisions the resources and writes the client config. */
function main() {
  const { slug, accountId } = parseArgs(process.argv.slice(2));
  const clientDir = join(ROOT, 'clients', slug);
  if (existsSync(clientDir)) throw new Error(`clients/${slug} already exists`);

  const env = cloudflareEnv(slug, accountId);
  const where = accountId ? `account ${accountId}` : 'the account of `wrangler login`';
  console.log(`[new-client] creating resources for "${slug}" in ${where}`);

  const d1Id = ensureD1(`${slug}-db`, env);
  const kvId = ensureKv(`${slug}-cache`, env);
  createIfMissing({ args: ['queues', 'create', `${slug}-jobs`], env });
  createIfMissing({ args: ['queues', 'create', `${slug}-jobs-dlq`], env });

  const client = buildClientConfig({
    slug,
    accountId,
    d1Id,
    kvId,
    rateLimitNamespaceBase: allocateRateLimitBase(join(ROOT, 'clients')),
  });
  mkdirSync(join(clientDir, 'extensions'), { recursive: true });
  writeFileSync(join(clientDir, 'client.jsonc'), JSON.stringify(client, null, 2) + '\n');
  copyFileSync(
    join(ROOT, 'clients', '_default', 'extensions', 'index.ts'),
    join(clientDir, 'extensions', 'index.ts'),
  );
  console.log(
    `[new-client] wrote clients/${slug}/client.jsonc (rate-limit base ${client.rateLimitNamespaceBase})`,
  );

  // R2 goes last: it must be enabled once in the Cloudflare dashboard before the first bucket can be created.
  try {
    createIfMissing({ args: ['r2', 'bucket', 'create', client.r2.bucket], env });
    console.log(`[new-client] R2 bucket ${client.r2.bucket} ready`);
  } catch (error) {
    const reason = String(error.message)
      .split('\n')
      .find((line) => line.trim() && !line.includes('failed:'));
    console.warn(`[new-client] R2 bucket NOT created: ${reason ?? error.message}`);
    console.warn(
      `[new-client] Enable R2 in the Cloudflare dashboard, then run: npx wrangler r2 bucket create ${client.r2.bucket}`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(`[new-client] ${error.message}`);
    process.exitCode = 1;
  }
}
