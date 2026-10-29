// Builds the seed of one per-vertical demo store from its catalogue module and, with --apply, loads it into a local
// database. The modules in verticals/ are the source of truth; no generated .sql file is kept in the repository.
//
// Usage: node scripts/demo/seed-vertical.mjs demo-ropa                      prints the SQL
//        node scripts/demo/seed-vertical.mjs demo-ropa --out seed.sql       writes it
//        node scripts/demo/seed-vertical.mjs demo-ropa --apply              loads it into DOCS_STATE's database
// The database must already have the migrations applied and hold no catalogue.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../lib/clients.mjs';
import { runStep } from '../lib/run.mjs';
import { STATE } from '../docs/shared.mjs';
import { verticalToSql } from './verticals/to-sql.mjs';

/** Catalogue module per demo slug. A demo without one is not a vertical demo. */
const MODULES = {
  'demo-ropa': 'ropa.mjs',
  'demo-skincare': 'skincare.mjs',
  'demo-despensa': 'despensa.mjs',
};

/**
 * Loads a vertical's catalogue module.
 * @param {string} slug Demo store slug.
 * @returns {Promise<object>} The catalogue.
 * @throws {Error} When the slug has no module.
 */
export async function loadVertical(slug) {
  const file = MODULES[slug];
  if (!file)
    throw new Error(`No catalogue for "${slug}". The vertical demos are ${Object.keys(MODULES).join(', ')}.`);
  const module = await import(pathToFileURL(join(ROOT, 'scripts', 'demo', 'verticals', file)).href);
  return module.default;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const slug = argv.find((argument) => !argument.startsWith('--'));
  if (!slug) throw new Error('Usage: node scripts/demo/seed-vertical.mjs <slug> [--out <file>] [--apply]');
  const sql = verticalToSql(await loadVertical(slug));

  const outIndex = argv.indexOf('--out');
  if (outIndex !== -1) {
    const out = argv[outIndex + 1];
    if (!out) throw new Error('--out needs a file name.');
    writeFileSync(out, sql);
    console.log(`${slug}: ${sql.split('\n').length} lines -> ${out}`);
  } else if (argv.includes('--apply')) {
    // Wrangler reads the statements from a file, so the SQL goes to a scratch one that is removed again.
    const scratch = mkdtempSync(join(tmpdir(), 'seed-vertical-'));
    const file = join(scratch, `${slug}.sql`);
    try {
      writeFileSync(file, sql);
      const result = runStep({
        command: 'npx',
        args: ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', STATE, '--file', file],
        capture: true,
      });
      if (!result.ok) throw new Error(`Loading the seed failed:\n${result.output}`);
      console.log(`${slug}: catalogue loaded into ${STATE}`);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  } else {
    process.stdout.write(sql);
  }
}
