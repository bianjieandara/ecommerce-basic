// Publishes the sample store to the public demo: copies every image of the snapshot from the local build to the demo's R2
// bucket and uploads demo/snapshot.json there. The demo Worker restores that snapshot in its next nightly reset (or on demand),
// so this needs no admin login. It refuses any client that is not a demo (client.jsonc must set vars.DEMO_MODE to "on").
//
// Usage: node scripts/demo/publish.mjs [--dry-run]            publish to the live demo (needs `wrangler login`)
//        node scripts/demo/publish.mjs --local                put the snapshot into the local build's bucket (tests)
// Run `npm run demo:snapshot` first.
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloudflareEnv, readClient, ROOT } from '../lib/clients.mjs';
import { runStep } from '../lib/run.mjs';
import { STATE } from '../docs/shared.mjs';

const CLIENT = 'demo';
// DEMO_SNAPSHOT_FILE lets a test publish a snapshot of its own, so the committed one is never replaced by test data.
const SNAPSHOT = process.env.DEMO_SNAPSHOT_FILE ?? join(ROOT, 'clients', CLIENT, 'snapshot', 'snapshot.json');
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
 * Publishes the snapshot and, for the live demo, its images.
 * @param {{ dryRun?: boolean, local?: boolean }} options `local` writes into the local build's persisted bucket instead of R2.
 */
export function publish({ dryRun = false, local = false }) {
  const client = readClient(CLIENT);
  if (client.vars?.DEMO_MODE !== 'on')
    throw new Error(
      `clients/${CLIENT}/client.jsonc must set vars.DEMO_MODE to "on" to receive a demo snapshot.`,
    );
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const bucket = client.r2.bucket;
  const env = cloudflareEnv(CLIENT, client.accountId);
  const target = local ? ['--local', '--persist-to', STATE] : ['--remote'];

  if (!local) copyImages({ snapshot, bucket, env, dryRun });
  // The snapshot goes last: the store only restores a version whose images are already in place.
  runStep({
    command: 'npx',
    args: [
      'wrangler',
      'r2',
      'object',
      'put',
      `${bucket}/demo/snapshot.json`,
      ...target,
      '--file',
      SNAPSHOT,
      '--content-type',
      'application/json',
    ],
    env,
    dryRun,
  });
  console.log(
    `published snapshot ${snapshot.version} (${local ? 'local build' : 'live demo'}): ${snapshot.media.length} images`,
  );
}

/**
 * Refuses an image that was not read from the local build. A failed `wrangler r2 object get` still leaves an empty file behind, and
 * uploading that file would replace the image in the live bucket with an empty object, so a failed or empty read stops the publish.
 * @param {{ ok: boolean }} read Result of the `get` step.
 * @param {string} file Where the image was written.
 * @param {string} key R2 key of the image.
 * @throws {Error} When the read failed or wrote nothing.
 */
export function assertImageRead(read, file, key) {
  const size = existsSync(file) ? statSync(file).size : 0;
  if (!read.ok || size === 0)
    throw new Error(
      `Could not read ${key} from the local build (${STATE}). Nothing was uploaded. Point DOCS_STATE at the local store the snapshot was ` +
        'taken from (it must hold every image of the snapshot) and run it again.',
    );
}

/**
 * Copies every image of the snapshot from the local build to the demo bucket. All images are read and checked first and only then
 * uploaded, so a missing image stops the publish before the bucket changes at all.
 * @param {{ snapshot: { media: string[] }, bucket: string, env: NodeJS.ProcessEnv, dryRun: boolean }} options Snapshot and target.
 * @param {typeof runStep} run Runs one command; tests pass a stand-in.
 */
export function copyImages({ snapshot, bucket, env, dryRun }, run = runStep) {
  const scratch = mkdtempSync(join(tmpdir(), 'demo-publish-'));
  const files = new Map(snapshot.media.map((key) => [key, join(scratch, key.replaceAll('/', '_'))]));
  try {
    for (const [key, file] of files) {
      const read = run({
        command: 'npx',
        args: [
          'wrangler',
          'r2',
          'object',
          'get',
          `${bucket}/${key}`,
          '--local',
          '--persist-to',
          STATE,
          '--file',
          file,
        ],
        env,
        dryRun,
      });
      if (!dryRun) assertImageRead(read, file, key);
    }
    for (const [key, file] of files) {
      run({
        command: 'npx',
        args: [
          'wrangler',
          'r2',
          'object',
          'put',
          `${bucket}/${key}`,
          '--remote',
          '--file',
          file,
          '--content-type',
          contentTypeOf(key),
        ],
        env,
        dryRun,
      });
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  publish({ dryRun: process.argv.includes('--dry-run'), local: process.argv.includes('--local') });
}
