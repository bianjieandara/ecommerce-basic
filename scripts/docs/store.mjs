// Starts the demo store the guide's screenshots are taken from: the production build (dist/) served by wrangler on port 4400,
// with its own database in .wrangler/docs-state, so it never touches the development data. The first run applies the
// migrations and the sample seed.
//
// Usage: npm run build && npm run docs:store      (leave it running, then run `npm run docs:data` and `npm run docs:screens`)
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { STATE } from './shared.mjs';

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

const server = spawn(
  'npx',
  ['wrangler', 'dev', '--config', CONFIG, '--persist-to', STATE, '--port', PORT, '--inspector-port', '9340'],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);
server.on('exit', (code) => process.exit(code ?? 0));
