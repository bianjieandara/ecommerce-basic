// Provisions one client: D1 database, R2 bucket, KV namespace and queues (with DLQ), then writes clients/<slug>/client.jsonc.
// Usage: node scripts/new-client.mjs <slug>
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonc } from './use-client.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SLUG_PATTERN = /^[a-z0-9-]{2,30}$/;
const DEFAULT_CRON = '*/15 * * * *';

/**
 * Runs a Wrangler command and returns its combined output. Throws when it fails.
 * @param {string[]} args Arguments after `wrangler`.
 * @returns {string} Combined stdout and stderr.
 */
export function runWrangler(args) {
  const result = spawnSync(`npx wrangler ${args.join(' ')}`, { cwd: ROOT, shell: true, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) throw new Error(`wrangler ${args.join(' ')} failed:\n${output}`);
  return output;
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
 * Allocates the next rate-limit namespace base (1000, 1010, 1020, ...) so no two clients share counters.
 * @param {string} clientsDir Absolute path to the clients folder.
 * @returns {number} Base value for the new client.
 */
export function nextRateLimitBase(clientsDir) {
  const used = readdirSync(clientsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_default')
    .map((entry) => join(clientsDir, entry.name, 'client.jsonc'))
    .filter((path) => existsSync(path))
    .map((path) => Number(readJsonc(path).rateLimitNamespaceBase));
  return used.length === 0 ? 1000 : Math.max(...used) + 10;
}

/**
 * Runs a create command and treats "already exists" as success, so re-running the script is safe.
 * @param {string[]} args Arguments after `wrangler`.
 */
export function ensureCreated(args) {
  try {
    runWrangler(args);
  } catch (error) {
    // Queues report "is already taken"; buckets and other resources report "already exists".
    if (!/already (exists|taken)|is taken/i.test(String(error.message))) throw error;
  }
}

/**
 * Reads a JSON array printed by `wrangler ... --json`, skipping Wrangler's banner lines.
 * @param {string[]} args Arguments after `wrangler`.
 * @returns {any[]} Parsed array.
 */
export function listJson(args) {
  const output = runWrangler(args);
  return JSON.parse(output.slice(output.indexOf('['), output.lastIndexOf(']') + 1));
}

/**
 * Returns the D1 database id, creating the database first when it does not exist.
 * @param {string} name Database name.
 * @returns {string} Database id.
 */
export function ensureD1(name) {
  const found = listJson(['d1', 'list', '--json']).find((db) => db.name === name);
  if (found) return found.uuid ?? found.id;
  return parseId(runWrangler(['d1', 'create', name]), /database_id["']?\s*[:=]\s*"([^"]+)"/, 'D1');
}

/**
 * Returns the KV namespace id, creating the namespace first when it does not exist.
 * @param {string} title Namespace title, for example "demo-cache".
 * @returns {string} Namespace id.
 */
export function ensureKv(title) {
  const found = listJson(['kv', 'namespace', 'list']).find(
    (ns) => ns.title === title || ns.title?.endsWith(`-${title}`),
  );
  if (found) return found.id;
  return parseId(
    runWrangler(['kv', 'namespace', 'create', title]),
    /\bid["']?\s*[:=]\s*"([0-9a-f]{32})"/,
    'KV',
  );
}

/** CLI entry: provisions resources and writes the client config. */
function main() {
  const slug = process.argv[2];
  if (!slug || !SLUG_PATTERN.test(slug))
    throw new Error('Usage: node scripts/new-client.mjs <slug> (a-z, 0-9, -; 2-30 chars)');

  const clientDir = join(ROOT, 'clients', slug);
  if (existsSync(clientDir)) throw new Error(`clients/${slug} already exists`);

  const d1Name = `${slug}-db`;
  const bucket = `${slug}-media`;
  const kvName = `${slug}-cache`;
  const queue = `${slug}-jobs`;
  const dlq = `${slug}-jobs-dlq`;

  console.log(`[new-client] creating resources for "${slug}" in the active Cloudflare account`);
  // R2 goes last: it must be enabled once in the Cloudflare dashboard before the first bucket can be created.
  const d1Id = ensureD1(d1Name);
  const kvId = ensureKv(kvName);
  ensureCreated(['queues', 'create', queue]);
  ensureCreated(['queues', 'create', dlq]);

  const client = {
    slug,
    workerName: `${slug}-store`,
    accountId: null,
    d1: { name: d1Name, id: d1Id },
    r2: { bucket },
    kv: { id: kvId },
    queue: { name: queue, dlq },
    analyticsDataset: `${slug.replace(/-/g, '_')}_events`,
    rateLimitNamespaceBase: nextRateLimitBase(join(ROOT, 'clients')),
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

  mkdirSync(join(clientDir, 'extensions'), { recursive: true });
  writeFileSync(join(clientDir, 'client.jsonc'), JSON.stringify(client, null, 2) + '\n');
  copyFileSync(
    join(ROOT, 'clients', '_default', 'extensions', 'index.ts'),
    join(clientDir, 'extensions', 'index.ts'),
  );
  console.log(
    `[new-client] wrote clients/${slug}/client.jsonc (rate-limit base ${client.rateLimitNamespaceBase})`,
  );

  try {
    ensureCreated(['r2', 'bucket', 'create', bucket]);
    console.log(`[new-client] R2 bucket ${bucket} ready`);
  } catch (error) {
    console.warn(
      `[new-client] R2 bucket NOT created: ${String(error.message).split('\n')[2] ?? error.message}`,
    );
    console.warn(
      `[new-client] Enable R2 in the Cloudflare dashboard, then run: npx wrangler r2 bucket create ${bucket}`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
