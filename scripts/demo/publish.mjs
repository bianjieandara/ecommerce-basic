// Publishes the sample store to the public demo: copies every image of the snapshot from the local build to the demo's R2
// bucket and uploads demo/snapshot.json there. The demo Worker restores that snapshot in its next nightly reset, so this
// script needs no admin login. It refuses any client that is not a demo (client.jsonc must set vars.DEMO_MODE to "on").
//
// Usage: node scripts/demo/publish.mjs [--dry-run]     (run `npm run demo:snapshot` first)
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloudflareEnv, readClient, ROOT } from '../lib/clients.mjs';
import { runStep } from '../lib/run.mjs';
import { STATE } from '../docs/shared.mjs';

const CLIENT = 'demo';
const SNAPSHOT = join(ROOT, 'clients', CLIENT, 'snapshot', 'snapshot.json');
const CONTENT_TYPES = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

/**
 * Content type of a stored image, from its key's extension.
 * @param {string} key R2 key, for example media/<id>/960.webp.
 * @returns {string} The MIME type to store with it.
 */
export function contentTypeOf(key) {
  const extension = key.split('.').pop() ?? '';
  const type = CONTENT_TYPES[extension];
  if (!type) throw new Error(`Unexpected image key ${key}`);
  return type;
}

/**
 * Publishes the snapshot and its images.
 * @param {{ dryRun: boolean }} options Print the commands only when true.
 */
export function publish({ dryRun }) {
  const client = readClient(CLIENT);
  if (client.vars?.DEMO_MODE !== 'on')
    throw new Error(`clients/${CLIENT}/client.jsonc must set vars.DEMO_MODE to "on" to receive a demo snapshot.`);
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const bucket = client.r2.bucket;
  const env = cloudflareEnv(CLIENT, client.accountId);
  const scratch = mkdtempSync(join(tmpdir(), 'demo-publish-'));
  try {
    for (const key of snapshot.media) {
      const file = join(scratch, key.replaceAll('/', '_'));
      // Read the image from the local build, then write it to the demo bucket. Every upload is a plain copy of bytes.
      runStep({
        command: 'npx',
        args: ['wrangler', 'r2', 'object', 'get', `${bucket}/${key}`, '--local', '--persist-to', STATE, '--file', file],
        env,
        dryRun,
      });
      runStep({
        command: 'npx',
        args: ['wrangler', 'r2', 'object', 'put', `${bucket}/${key}`, '--remote', '--file', file, '--content-type', contentTypeOf(key)],
        env,
        dryRun,
      });
    }
    // The snapshot goes last: the store only restores a version whose images are already in place.
    runStep({
      command: 'npx',
      args: ['wrangler', 'r2', 'object', 'put', `${bucket}/demo/snapshot.json`, '--remote', '--file', SNAPSHOT, '--content-type', 'application/json'],
      env,
      dryRun,
    });
    console.log(`published snapshot ${snapshot.version}: ${snapshot.media.length} images to ${bucket}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  publish({ dryRun: process.argv.includes('--dry-run') });
}
