// Deploys one client: root wrangler.jsonc, build, queues (created only when missing), remote D1 migrations, then the Worker.
// Usage: node scripts/deploy-client.mjs <slug> [--dry-run]   (--dry-run prints each command and runs nothing)
import { closeSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readClient, cloudflareEnv } from './lib/clients.mjs';
import { createIfMissing, runStep } from './lib/run.mjs';
import { buildWranglerConfig, writeWranglerConfig } from './use-client.mjs';

/**
 * Runs the deploy steps for one client in order and stops at the first failure.
 * The config is validated before any step, so a broken client.jsonc fails in dry-run too.
 * @param {string} slug Client slug.
 * @param {{ dryRun: boolean }} options Dry-run prints the commands only.
 */
export function deployClient(slug, { dryRun }) {
  const client = readClient(slug);
  let env = process.env;
  try {
    env = cloudflareEnv(slug, client.accountId);
  } catch (error) {
    // A dry run still reports the problem, but it must not stop the preview of the other steps.
    if (!dryRun) throw error;
    console.warn(`[deploy-client] dry-run warning: ${error.message}`);
  }

  // The dry run builds the config in memory only, so an invalid client.jsonc still fails the preview.
  if (dryRun) {
    buildWranglerConfig(slug);
    console.log(`[dry-run] write wrangler.jsonc for "${slug}" (worker ${client.workerName})`);
  } else {
    writeWranglerConfig(slug);
  }

  const steps = [
    [
      'build',
      () => runStep({ command: 'npm', args: ['run', 'build'], env: { ...env, CLIENT_SLUG: slug }, dryRun }),
    ],
    ['queues', () => queues(client, env, dryRun)],
    [
      'd1 migrations',
      () =>
        runStep({
          command: 'npx',
          args: ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote'],
          env,
          dryRun,
        }),
    ],
    ['deploy', () => runStep({ command: 'npx', args: ['wrangler', 'deploy'], env, dryRun })],
  ];
  for (const [label, run] of steps) {
    console.log(`\n== ${slug}: ${label}`);
    if (!run().ok) throw new Error(`${slug}: step "${label}" failed; nothing after it ran.`);
  }
}

/**
 * Creates the main queue and its dead-letter queue when they are missing. Safe to repeat.
 * @param {any} client Parsed client configuration.
 * @param {NodeJS.ProcessEnv} env Environment for the child process.
 * @param {boolean} dryRun Print only.
 * @returns {{ ok: boolean }} Result in the same shape as a command step.
 */
function queues(client, env, dryRun) {
  for (const name of [client.queue.name, client.queue.dlq]) {
    createIfMissing({ args: ['queues', 'create', name], env, dryRun });
  }
  return { ok: true };
}

/**
 * Path of the lock file that marks a deploy in progress. It sits in .wrangler/ (gitignored), so it never gets committed.
 * Two deploys at once share dist/, and a build in the middle of another deploy removed its output, so only one may run.
 */
const LOCK_PATH = fileURLToPath(new URL('../.wrangler/deploy.lock', import.meta.url));

/**
 * Takes the deploy lock. The file is created exclusively, so two processes cannot both take it.
 * @returns {boolean} True when the lock was taken; false when another deploy holds it.
 */
function takeLock() {
  try {
    const fd = openSync(LOCK_PATH, 'wx');
    writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    closeSync(fd);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

/**
 * Describes the deploy that holds the lock, for the message shown to the person who was blocked.
 * @returns {string} Who holds the lock and when it started.
 */
function lockHolder() {
  try {
    const { pid, startedAt } = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    return `process ${pid}, started ${startedAt}`;
  } catch {
    return 'unknown process';
  }
}

/** CLI entry. Exits 2 on a usage error, 1 when a step fails, and 3 when another deploy is in progress. */
function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg.startsWith('--') && arg !== '--dry-run');
  const slug = args.find((arg) => !arg.startsWith('--'));
  if (!slug || unknown.length > 0) {
    console.error('Usage: node scripts/deploy-client.mjs <slug> [--dry-run]');
    process.exitCode = 2;
    return;
  }
  const dryRun = args.includes('--dry-run');
  if (!dryRun && !takeLock()) {
    console.error(`[deploy-client] If no deploy is running, delete ${LOCK_PATH} and run this again.`);
    console.error(
      `[deploy-client] A deploy is in progress (${lockHolder()}). Wait for it to finish, then run this again.`,
    );
    process.exitCode = 3;
    return;
  }
  try {
    deployClient(slug, { dryRun });
    console.log(
      `\n[deploy-client] ${dryRun ? 'dry run finished, nothing was changed' : `deployed "${slug}"`}`,
    );
  } finally {
    if (!dryRun) rmSync(LOCK_PATH, { force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(`[deploy-client] ${error.message}`);
    process.exitCode = 1;
  }
}
