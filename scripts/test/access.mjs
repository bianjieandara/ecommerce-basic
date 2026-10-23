// Access test of the LOCAL demo store. 1) Every admin API route refuses an anonymous GET and POST. 2) An editor cannot open or use
// the owner-only screens and actions; a deactivated user, an expired session and a made-up token are refused. Temporary users
// are created in the demo database and removed at the end.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:access
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BASE, post, sql } from '../docs/shared.mjs';

const results = [];
/**
 * Records and prints one check.
 * @param name What was checked.
 * @param ok Whether it passed.
 * @param detail Extra text shown after the name.
 */
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
}

const refused = (status) => [301, 302, 303, 307, 308, 401, 403, 404, 405].includes(status);

// 1. Anonymous access. The routes that must work without a session are listed; everything else must refuse.
const PUBLIC = new Set(['login', 'logout', 'setup', 'password/forgot', 'password/reset']);
const files = execSync('git ls-files src/pages/api/admin', { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file.endsWith('.ts'));
const open = [];
for (const file of files) {
  const route = file
    .replace('src/pages/api/admin/', '')
    .replace(/\.ts$/, '')
    .replace(/\[[^\]]+\]/g, '00000000-0000-0000-0000-000000000000');
  if (PUBLIC.has(route)) continue;
  for (const method of ['GET', 'POST']) {
    const response = await fetch(`${BASE}/api/admin/${route}`, {
      method,
      redirect: 'manual',
      headers: { 'content-type': 'application/json', origin: BASE },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    if (!refused(response.status)) open.push(`${method} ${route} -> ${response.status}`);
  }
}
check(
  `anonymous GET and POST refused on ${files.length - PUBLIC.size} admin API routes`,
  open.length === 0,
  open.join('; '),
);

// 2. Roles and sessions.
const sha = (value) => createHash('sha256').update(value).digest('hex');
const iso = (days) => new Date(Date.now() + days * 86400000).toISOString();
const owner = readFileSync('.wrangler/docs-cookie.txt', 'utf8');
const users = [
  ['t-editor', 'editor-test@example.com', 1, 'editor-token', 1],
  ['t-inactive', 'inactive-test@example.com', 0, 'inactive-token', 1],
  ['t-expired', 'expired-test@example.com', 1, 'expired-token', -1],
];
const ids = users.map(([id]) => `'${id}'`).join(', ');
try {
  for (const [id, email, active, token, days] of users) {
    sql(
      `INSERT OR REPLACE INTO admin_users (id, email, name, password_hash, role, locale, is_active, created_at, updated_at) VALUES ('${id}', '${email}', 'Test', 'not-a-hash', 'editor', 'en', ${active}, '${iso(0)}', '${iso(0)}')`,
    );
    sql(
      `INSERT OR REPLACE INTO admin_sessions (token_hash, user_id, expires_at, created_at) VALUES ('${sha(token)}', '${id}', '${iso(days)}', '${iso(0)}')`,
    );
  }
  const page = async (path, cookie) =>
    (await fetch(BASE + path, { headers: { cookie }, redirect: 'manual' })).status;
  const editor = 'admin_session=editor-token';

  for (const path of [
    '/admin',
    '/admin/products',
    '/admin/orders',
    '/admin/inventory',
    '/admin/pages',
    '/admin/emails',
  ]) {
    const status = await page(path, editor);
    check(`editor can open ${path}`, status === 200, String(status));
  }
  for (const path of [
    '/admin/users',
    '/admin/settings/general',
    '/admin/settings/theme',
    '/admin/jobs',
    '/admin/whatsapp',
  ]) {
    const status = await page(path, editor);
    check(`editor gets 403 on ${path}`, status === 403, String(status));
  }
  const nobody = '00000000-0000-0000-0000-000000000000';
  const ownerOnly = [
    ['/api/admin/settings/theme', { values: {} }],
    ['/api/admin/invites', { email: 'x@example.com', name: 'Test User', role: 'owner' }],
    ['/api/admin/users/t-editor', { role: 'owner' }],
    ['/api/admin/users/t-editor/delete', {}],
    ['/api/admin/invoices/void', { invoiceId: 'does-not-exist', reason: 'testing' }],
    [`/api/admin/jobs/${nobody}/retry`, {}],
    [`/api/admin/jobs/${nobody}/discard`, {}],
    ['/api/admin/whatsapp/order_shipped/submit', {}],
    ['/api/admin/whatsapp/order_shipped/sync', {}],
  ];
  for (const [path, body] of ownerOnly) {
    const response = await post(path, body, editor);
    check(
      `editor refused: POST ${path}`,
      response.status === 403,
      `${response.status} ${response.json?.error?.code ?? ''}`,
    );
  }
  const role = sql("SELECT role FROM admin_users WHERE id = 't-editor'")[0].role;
  check('editor role unchanged after the attempts', role === 'editor', role);

  for (const [name, cookie] of [
    ['deactivated user', 'admin_session=inactive-token'],
    ['expired session', 'admin_session=expired-token'],
    ['unknown token', 'admin_session=made-up-token'],
    ['empty cookie', 'admin_session='],
  ]) {
    const status = await page('/admin/products', cookie);
    const api = await post('/api/admin/products/duplicate', { id: 'x' }, cookie);
    check(
      `${name} refused`,
      refused(status) && [401, 403].includes(api.status),
      `page ${status}, api ${api.status}`,
    );
  }
  check('owner can open /admin/users', (await page('/admin/users', owner)) === 200);
} finally {
  sql(`DELETE FROM admin_sessions WHERE user_id IN (${ids})`);
  sql(`DELETE FROM admin_users WHERE id IN (${ids})`);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exitCode = results.every(Boolean) ? 0 : 1;
