// Deploys every client in clients/ (except _default), one after another, and prints a summary table.
// Usage: node scripts/deploy-all.mjs [--dry-run]. A failed client does not stop the others; the exit code is 1 if any failed.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, listClientSlugs } from './lib/clients.mjs';

/**
 * Formats rows as a plain-text table with padded columns.
 * @param {{ client: string, result: string, seconds: string }[]} rows Summary rows.
 * @returns {string} Table text, header included.
 */
export function formatTable(rows) {
  const header = { client: 'client', result: 'result', seconds: 'seconds' };
  const all = [header, ...rows];
  const width = (key) => Math.max(...all.map((row) => row[key].length));
  const widths = { client: width('client'), result: width('result'), seconds: width('seconds') };
  return all
    .map((row) =>
      [
        row.client.padEnd(widths.client),
        row.result.padEnd(widths.result),
        row.seconds.padStart(widths.seconds),
      ].join('  '),
    )
    .join('\n');
}

/** CLI entry: runs deploy-client.mjs for each client and prints the summary. */
function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  const slugs = listClientSlugs();
  if (slugs.length === 0) throw new Error('No clients found in clients/ (each needs a client.jsonc).');

  const rows = slugs.map((slug) => {
    console.log(`\n==================== ${slug} ====================`);
    const started = Date.now();
    const child = spawnSync(
      process.execPath,
      [join(ROOT, 'scripts', 'deploy-client.mjs'), slug, ...(dryRun ? ['--dry-run'] : [])],
      { cwd: ROOT, stdio: 'inherit' },
    );
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    return {
      client: slug,
      result: child.status === 0 ? 'ok' : `failed (exit ${child.status ?? 'signal'})`,
      seconds,
    };
  });

  console.log(`\n${formatTable(rows)}`);
  const failed = rows.filter((row) => row.result !== 'ok').length;
  if (failed > 0) {
    console.error(`[deploy-all] ${failed} of ${rows.length} clients failed.`);
    process.exitCode = 1;
  } else {
    console.log(`[deploy-all] ${dryRun ? 'dry run finished' : 'all clients deployed'} (${rows.length}).`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(`[deploy-all] ${error.message}`);
    process.exitCode = 1;
  }
}
