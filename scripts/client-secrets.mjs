// Uploads .secrets/<slug>.json to the client's Worker with `wrangler secret bulk`. The file is gitignored.
// It is a flat JSON object: { "DLOCALGO_SECRET_KEY": "...", ... }. Clients with their own account also need .secrets/<slug>.env.
// Usage: node scripts/client-secrets.mjs <slug>
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, cloudflareEnv, readClient, readJsonc } from './lib/clients.mjs';
import { runStep } from './lib/run.mjs';

const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Checks the secrets object before anything is uploaded: a flat object, valid names, non-empty string values.
 * @param {unknown} secrets Parsed .secrets/<slug>.json.
 * @returns {string[]} Secret names.
 */
export function validateSecrets(secrets) {
  if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets))
    throw new Error('The secrets file must be a JSON object: {"NAME": "value"}.');
  const names = Object.keys(secrets);
  if (names.length === 0) throw new Error('The secrets file has no secrets.');
  const badNames = names.filter((name) => !SECRET_NAME_PATTERN.test(name));
  if (badNames.length > 0) throw new Error(`Secret names must be UPPER_SNAKE_CASE: ${badNames.join(', ')}`);
  const empty = names.filter((name) => typeof secrets[name] !== 'string' || secrets[name] === '');
  if (empty.length > 0) throw new Error(`Secrets must be non-empty strings: ${empty.join(', ')}`);
  return names;
}

/** CLI entry: validates the secrets file, then uploads it. The temporary copy is removed in every case. */
function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error('Usage: node scripts/client-secrets.mjs <slug>');
  const client = readClient(slug);

  const secretsPath = join(ROOT, '.secrets', `${slug}.json`);
  if (!existsSync(secretsPath)) throw new Error(`Missing ${secretsPath}`);
  const secrets = readJsonc(secretsPath);
  const names = validateSecrets(secrets);
  const env = cloudflareEnv(slug, client.accountId);

  // A private temporary directory, so the file is never readable by other local users and is deleted afterwards.
  const dir = mkdtempSync(join(tmpdir(), 'ebaq-secrets-'));
  try {
    const file = join(dir, 'secrets.json');
    writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
    const result = runStep({
      command: 'npx',
      args: ['wrangler', 'secret', 'bulk', file, '--name', client.workerName],
      env,
    });
    if (!result.ok) throw new Error(`wrangler secret bulk failed for ${client.workerName}`);
    console.log(`[client-secrets] uploaded ${names.length} secrets to ${client.workerName}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(`[client-secrets] ${error.message}`);
    process.exitCode = 1;
  }
}
