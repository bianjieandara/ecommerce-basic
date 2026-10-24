// Runs every test of scripts/test/ one after the other against the LOCAL demo store and prints one line per test and a summary. They run
// one at a time because several change the store and all share its form rate limit. The exit code is 1 when any test fails.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:all   (about 25 minutes)
//        node scripts/test/all.mjs filters keyboard      runs only the named tests
import { spawn } from 'node:child_process';

/** The tests, cheapest first, with what they cover. */
const TESTS = [
  ['access', 'anonymous access, roles, sessions'],
  ['consent', 'cookie banner and the Meta Pixel (Chrome)'],
  ['keyboard', 'keyboard, dialogs, focus rings (Chrome)'],
  ['crawl', 'every link, image, script and tag on every page'],
  ['filters', 'storefront filters, sorts, paging, counts, URLs'],
  ['admin-filters', 'admin list filters and search'],
  ['admin-actions', 'admin create, edit, delete, settings, emails'],
  ['smoke', 'pages, API, checkout paths, feeds, reports'],
  ['flows', 'cart, checkout, search, forms in Chrome'],
  ['orders', 'order lifecycle, stock, invoices, reports, accounts'],
  ['reports', 'report figures against independent SQL, change vs previous period'],
  ['whatsapp', 'WhatsApp templates, shipped and invoice messages, statuses (fake Graph API)'],
];
const wanted = process.argv.slice(2);
const todo = TESTS.filter(([name]) => wanted.length === 0 || wanted.includes(name));
const summary = [];

for (const [name, what] of todo) {
  const started = Date.now();
  process.stdout.write(`\n=== ${name}: ${what}\n`);
  let tail = '';
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [`scripts/test/${name}.mjs`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const keep = (chunk) => {
      tail = (tail + chunk).slice(-6000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('close', resolve);
  });
  const lines = tail.split(/\r?\n/);
  const result =
    [...lines].reverse().find((line) => /\d+\/\d+ passed|No problems found|\d+ problems/.test(line)) ??
    '(no summary line)';
  const failed = lines.filter((line) => /^FAIL|^\s+\S.* {2}-> /.test(line)).slice(0, 8);
  summary.push({ name, code, result: result.trim(), seconds: Math.round((Date.now() - started) / 1000) });
  console.log(
    `${code === 0 ? 'PASS' : 'FAIL'}  ${name}  ${result.trim()}  (${Math.round((Date.now() - started) / 1000)} s)`,
  );
  for (const line of failed) console.log(`      ${line.trim().slice(0, 200)}`);
}

const failures = summary.filter((item) => item.code !== 0);
console.log(`\n${summary.length - failures.length}/${summary.length} test files passed`);
process.exitCode = failures.length === 0 ? 0 : 1;
