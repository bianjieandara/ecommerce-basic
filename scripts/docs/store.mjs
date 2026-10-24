// Starts the demo store the guide's screenshots are taken from: the production build (dist/) served by wrangler on port 4400,
// with its own database in .wrangler/docs-state, so it never touches the development data. The first run applies the
// migrations and the sample seed.
//
// Usage: npm run build && npm run docs:store      (leave it running, then run `npm run docs:data` and `npm run docs:screens`)
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { DEMO_GRAPH_VARS, DEMO_WEBHOOK_VARS, STATE } from './shared.mjs';

const CONFIG = 'dist/server/wrangler.json';
const PORT = process.env.DOCS_PORT ?? '4400';

if (!existsSync(CONFIG)) {
  console.error('There is no build yet. Run `npm run build` first.');
  process.exit(1);
}

const run = (command) => execSync(command, { stdio: 'inherit' });
const firstRun = !existsSync(`${STATE}/v3/d1`);
if (firstRun) {
  run(`npx wrangler d1 migrations apply DB --local --persist-to ${STATE}`);
  run(`npx wrangler d1 execute DB --local --persist-to ${STATE} --file=db/seed/dev.sql`);
}

// Fixed test secrets for the WhatsApp webhook, so the signed-webhook tests need no Meta account (see shared.mjs).
// The Graph API address too: the demo store talks to the local fake of the tests, never to Meta.
const vars = Object.entries({ ...DEMO_WEBHOOK_VARS, ...DEMO_GRAPH_VARS }).flatMap(([name, value]) => [
  '--var',
  `${name}:${value}`,
]);
const server = spawn(
  'npx',
  [
    'wrangler',
    'dev',
    '--config',
    CONFIG,
    '--persist-to',
    STATE,
    '--port',
    PORT,
    '--inspector-port',
    '9340',
    ...vars,
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
server.on('exit', (code) => process.exit(code ?? 0));
