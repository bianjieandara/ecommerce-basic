// Uploads .secrets/<slug>.json to the client's Worker with `wrangler secret bulk`.
// The secrets file is a flat JSON object: { "STRIPE_SECRET_KEY": "...", ... }. It is gitignored.
// Usage: node scripts/client-secrets.mjs <slug>
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonc } from './use-client.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** CLI entry: pushes the client's secrets to its Worker, then removes the temporary file. */
function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error('Usage: node scripts/client-secrets.mjs <slug>');

  const client = readJsonc(join(ROOT, 'clients', slug, 'client.jsonc'));
  const secretsPath = join(ROOT, '.secrets', `${slug}.json`);
  if (!existsSync(secretsPath)) throw new Error(`Missing ${secretsPath}`);
  const secrets = readJsonc(secretsPath);
  const empty = Object.keys(secrets).filter((key) => secrets[key] === '');
  if (empty.length > 0) throw new Error(`Empty secret values: ${empty.join(', ')}`);

  const tempPath = join(tmpdir(), `${slug}-secrets-${Date.now()}.json`);
  writeFileSync(tempPath, JSON.stringify(secrets));
  try {
    const result = spawnSync(`npx wrangler secret bulk "${tempPath}" --name ${client.workerName}`, {
      cwd: ROOT,
      shell: true,
      stdio: 'inherit',
    });
    if (result.status !== 0) throw new Error(`wrangler secret bulk failed for ${client.workerName}`);
    console.log(`[client-secrets] uploaded ${Object.keys(secrets).length} secrets to ${client.workerName}`);
  } finally {
    unlinkSync(tempPath);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
