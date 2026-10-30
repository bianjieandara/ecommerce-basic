// Fails if a price is written by hand anywhere in the guide. Prices belong to e-baq.com/precios.json, which
// docs-site/src/data/precios.ts fetches at build time and precios-respaldo.json mirrors for when it is down.
// The guide is meant to carry no amounts of its own: it points at the site and at the quote.
//
// A number is only reported when it reads as a price — grouped in thousands, or carrying its currency — so
// the 44 in "44px" and the 2026 in a date stay out of it.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs-site');
const FALLBACK = join('src', 'data', 'precios-respaldo.json');
const prices = JSON.parse(readFileSync(join(ROOT, FALLBACK), 'utf8'));

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.astro', '.md', '.mdx', '.json']);

/** Every amount we charge. Yearly plan prices are ten monthly ones, so those are watched too. */
const AMOUNTS = new Set();
for (const regions of Object.values(prices)) {
  for (const [region, { monto }] of Object.entries(regions)) {
    AMOUNTS.add(monto);
    if (region === 'MX') AMOUNTS.add(monto * 10);
  }
}

/** A line that only explains a price is fine; a line that states one is not. */
const IS_COMMENT = /^\s*(\/\/|\/\*|\*|<!--|#)/;

/** Grouped in thousands, or followed by its currency. A bare "$40" is not enough: it is often someone else's price. */
const GROUPED = /(?<![\d,.])\d{1,3},\d{3}(?![\d.,]*\d)/g;
const WITH_CURRENCY = /(?<![\d,.])(\d[\d,]*)(?=\s?(?:MXN|USD|\/mes|\/month)|\s+(?:al mes|a month))/g;

const findings = [];

function inspect(file) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (rel === FALLBACK.replace(/\\/g, '/')) return;

  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (IS_COMMENT.test(line)) return;
      const raw = [
        ...[...line.matchAll(GROUPED)].map((m) => m[0]),
        ...[...line.matchAll(WITH_CURRENCY)].map((m) => m[1]),
      ];
      for (const found of raw) {
        if (!AMOUNTS.has(Number(found.replace(/,/g, '')))) continue;
        findings.push({ file: rel, line: i + 1, amount: found, text: line.trim().slice(0, 110) });
      }
    });
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (EXTENSIONS.has(extname(entry))) inspect(path);
  }
}

walk(join(ROOT, 'src'));

if (findings.length === 0) {
  console.log(`Prices: none written by hand in the guide (${AMOUNTS.size} amounts watched).`);
  process.exit(0);
}

console.error(`${findings.length} price(s) written by hand in the guide:\n`);
for (const f of findings) {
  console.error(`  docs-site/${f.file}:${f.line}  ->  ${f.amount}`);
  console.error(`    ${f.text}`);
}
console.error('\nRead the amount from data/precios.ts instead, or leave it to the site and the quote.');
process.exit(1);
