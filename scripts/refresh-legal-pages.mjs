// Rewrites the stored privacy, terms and shipping pages of a store with the current default legal pages (lead, summary, clauses,
// rights block). Existing stores keep the old single text block until this runs, because setup only creates system pages once.
// Anything the owner edited on these three pages is replaced, so run it only on stores that still use the default text.
//
// Usage: node scripts/refresh-legal-pages.mjs --persist-to .wrangler/docs-state     (the local demo store)
//        node scripts/refresh-legal-pages.mjs --remote                                 (the deployed store of this checkout's client)
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const persistTo = args.includes('--persist-to') ? args[args.indexOf('--persist-to') + 1] : '';
if (!remote && !persistTo) {
  console.error('Pass --remote (the deployed store) or --persist-to <folder> (a local database).');
  process.exit(1);
}

const { LEGAL_PAGE_SECTIONS } = await import(
  pathToFileURL(`${process.cwd()}/src/application/content/defaults/legal-pages.ts`).href
);
const quote = (text) => `'${text.replace(/'/g, "''")}'`;
const now = new Date().toISOString();
const statements = Object.entries(LEGAL_PAGE_SECTIONS).map(([slug, sections]) => {
  // The same ids the storefront gives the code default of a page, so edits in the admin keep working.
  const stored = sections.map((section, index) => ({ id: `${slug}-${index}`, ...section }));
  return `UPDATE pages SET sections_json = ${quote(JSON.stringify(stored))}, updated_at = ${quote(now)} WHERE slug = ${quote(slug)};`;
});

const file = join(mkdtempSync(join(tmpdir(), 'legal-')), 'refresh.sql');
writeFileSync(file, statements.join('\n') + '\n');
const target = remote ? '--remote' : `--local --persist-to ${persistTo}`;
execSync(`npx wrangler d1 execute DB ${target} --file="${file}"`, { stdio: 'inherit' });
console.log(`Refreshed ${statements.length} pages: ${Object.keys(LEGAL_PAGE_SECTIONS).join(', ')}`);
