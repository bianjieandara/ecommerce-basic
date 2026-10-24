// Multi-client provisioning on this machine, with no Cloudflare calls: a second client is written with placeholder resource ids, the
// dry run of deploy:all must list both clients with their own commands, and the generated worker configs must share no resource
// (worker, database, bucket, queues, cache namespace, analytics dataset, rate-limit namespaces). The temporary client is removed.
// What this cannot show is the real deployment of two clients and a purchase on each: docs/NEW_CLIENT.md lists those steps.
//
// Usage: npm run test:clients
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { buildClientConfig } from '../new-client.mjs';
import {
  allocateRateLimitBase,
  assertRealTurnstileKey,
  listClientSlugs,
  readClient,
  ROOT,
} from '../lib/clients.mjs';
import { buildWranglerConfig } from '../use-client.mjs';

const SLUG = 'zz-test-client';
const results = [];
const failures = [];
/**
 * Records one check.
 * @param name What was checked.
 * @param ok Whether it passed.
 * @param detail Shown when it failed.
 */
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
  if (!ok) failures.push(name);
}
/** Every leaf of an object as `path -> value`. */
function flat(value, path = '', out = {}) {
  for (const [key, inner] of Object.entries(value ?? {})) {
    const at = path ? `${path}.${key}` : key;
    if (inner && typeof inner === 'object') flat(inner, at, out);
    else out[at] = inner;
  }
  return out;
}

const dir = `${ROOT}/clients/${SLUG}`;
if (existsSync(dir)) {
  console.error(`clients/${SLUG} exists (an interrupted run?). Remove it first.`);
  process.exit(2);
}
try {
  check('a "demo" client exists to compare with', listClientSlugs().includes('demo'));
  const config = buildClientConfig({
    slug: SLUG,
    accountId: undefined,
    d1Id: '00000000-0000-0000-0000-000000000001',
    kvId: '00000000000000000000000000000002',
    rateLimitNamespaceBase: allocateRateLimitBase(),
  });
  // A fresh client carries Cloudflare's test Turnstile key, which deploy refuses (checked below). This one stands for a store
  // that has its own widget, so the dry run of every client can pass.
  const templateKey = config.vars.TURNSTILE_SITE_KEY;
  config.vars.TURNSTILE_SITE_KEY = '0x4AAAAAAAtestStoreSiteKey';
  mkdirSync(`${dir}/extensions`, { recursive: true });
  writeFileSync(`${dir}/client.jsonc`, JSON.stringify(config, null, 2) + '\n');
  copyFileSync(`${ROOT}/clients/_default/extensions/index.ts`, `${dir}/extensions/index.ts`);
  const refuses = (client) => {
    try {
      assertRealTurnstileKey(client);
      return false;
    } catch {
      return true;
    }
  };
  check(
    'deploy refuses the template Turnstile test key',
    refuses({ ...config, vars: { ...config.vars, TURNSTILE_SITE_KEY: templateKey } }),
  );
  check(
    'a client may opt in to the test key (the public demo does)',
    !refuses({
      ...config,
      allowTestTurnstile: true,
      vars: { ...config.vars, TURNSTILE_SITE_KEY: templateKey },
    }),
  );
  check('a real site key passes', !refuses(config));
  check(
    'the new client is found and valid',
    listClientSlugs().includes(SLUG) && readClient(SLUG).slug === SLUG,
  );

  const run = spawnSync(process.execPath, ['scripts/deploy-all.mjs', '--dry-run'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const out = run.stdout;
  check(
    'deploy:all --dry-run succeeds for every client',
    run.status === 0 && /dry run finished \(\d+\)/.test(out),
    run.stderr.slice(0, 200),
  );
  for (const slug of [SLUG, 'demo']) {
    check(
      `it plans build, queues, migrations and deploy for ${slug}`,
      [
        `write wrangler.jsonc for "${slug}"`,
        `queues create ${slug}-jobs`,
        `queues create ${slug}-jobs-dlq`,
        'd1 migrations apply DB --remote',
        'wrangler deploy',
      ].every((part) => out.includes(part)),
      '',
    );
  }
  check('nothing was changed by the dry run', /nothing was changed/.test(out));

  const a = flat(buildWranglerConfig('demo').client);
  const b = flat(buildWranglerConfig(SLUG).client);
  const resourceKeys = Object.keys(a).filter((key) =>
    /workerName|d1\.|r2\.|kv\.|queue\.|analyticsDataset|rateLimitNamespaceBase/.test(key),
  );
  const shared = resourceKeys.filter((key) => a[key] === b[key]);
  check(
    'the two clients share no worker, database, bucket, queue, cache, dataset or rate-limit namespace',
    shared.length === 0,
    shared.map((key) => `${key}=${a[key]}`).join(', '),
  );
  check('there are resource keys to compare', resourceKeys.length >= 8, String(resourceKeys.length));
  const text = (slug) => buildWranglerConfig(slug).text;
  check(
    'each generated wrangler config names only its own worker',
    text('demo').includes('demo-store') &&
      !text('demo').includes(`${SLUG}-store`) &&
      text(SLUG).includes(`${SLUG}-store`) &&
      !text(SLUG).includes('demo-store'),
  );
  check(
    'each generated config names only its own database id',
    text('demo').includes(a['d1.id']) &&
      !text('demo').includes(b['d1.id']) &&
      text(SLUG).includes(b['d1.id']) &&
      !text(SLUG).includes(a['d1.id']),
  );

  const bad = spawnSync(process.execPath, ['scripts/deploy-client.mjs', 'Not A Slug', '--dry-run'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  check('a malformed slug is refused', bad.status !== 0);
  const missing = spawnSync(process.execPath, ['scripts/deploy-client.mjs', 'no-such-client', '--dry-run'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  check('a client that does not exist is refused', missing.status !== 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
if (failures.length > 0) {
  console.log('Failed:\n - ' + failures.join('\n - '));
  process.exitCode = 1;
}
