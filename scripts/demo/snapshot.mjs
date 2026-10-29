// Freezes the sample store of a LOCAL build into clients/<slug>/snapshot/snapshot.json, the file that demo store restores every night.
// It reads an explicit, ordered list of tables (parents first), leaves out what belongs to visitors or to the server (sessions,
// logs, payment events, the search index) and rewrites every admin user id to one fixed demo account id. The file is small
// text, so it is committed and reviewed like any other change.
//
// Usage: npm run demo:snapshot                  (the "demo" store; reads .wrangler/demo-build, or DOCS_STATE)
//        npm run demo:snapshot -- demo-ropa     (another demo store, for example one of the per-vertical ones)
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoSlugFromArgv } from '../lib/clients.mjs';
import { sql, STATE } from '../docs/shared.mjs';
import { assertBannerAlways } from './banner-rule.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SLUG = demoSlugFromArgv(process.argv.slice(2));
// DEMO_SNAPSHOT_FILE lets a test write elsewhere, so a test run never overwrites the committed snapshot.
const OUT = process.env.DEMO_SNAPSHOT_FILE ?? join(ROOT, 'clients', SLUG, 'snapshot', 'snapshot.json');

/** Id the demo account gets in the snapshot. The Worker reads it from the file, so the value lives in one place. */
const DEMO_ACCOUNT_ID = 'demo-account';

/**
 * Tables of the sample store, parents before children, so a restore can insert them in this order.
 * Not listed on purpose: admin_users, admin_sessions, password_reset_tokens (accounts and sessions), notification_log,
 * failed_jobs, payment_events (logs), stock_subscriptions (visitors' e-mail addresses), product_search (rebuilt on restore).
 */
export const SNAPSHOT_TABLES = [
  'settings',
  'shipping_methods',
  'media_assets',
  'attributes',
  'attribute_values',
  'categories',
  'category_translations',
  'products',
  'product_translations',
  'product_categories',
  'product_images',
  'product_variants',
  'variant_attribute_values',
  'inventory_movements',
  'orders',
  'order_items',
  'order_events',
  'order_counter',
  'invoice_counters',
  'invoices',
  'email_templates',
  'pages',
  'testimonials',
  'daily_metrics',
];

/**
 * Reads every row of a table from the local build.
 * @param {string} table Table name from SNAPSHOT_TABLES.
 * @returns {Record<string, unknown>[]} The rows, in primary-key order.
 */
function readTable(table) {
  return sql(`SELECT * FROM ${table}`);
}

/**
 * Lists the admin user ids of the build, so their references can be rewritten.
 * @returns {Set<string>} Ids of every admin user in the build.
 */
function adminIds() {
  return new Set(sql('SELECT id FROM admin_users').map((row) => row.id));
}

/**
 * Replaces every admin id in the rows with the demo account id.
 * @param {Record<string, unknown>[]} rows Rows of one table.
 * @param {Set<string>} ids Admin user ids of the build.
 * @returns {Record<string, unknown>[]} The rows, rewritten.
 */
function rewriteAdmins(rows, ids) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([column, value]) => [
        column,
        typeof value === 'string' && ids.has(value) ? DEMO_ACCOUNT_ID : value,
      ]),
    ),
  );
}

/**
 * The R2 keys of every stored image, read from the variants of each media asset.
 * @param {Record<string, unknown>[]} assets Rows of media_assets.
 * @returns {string[]} Keys in the order the assets were created.
 */
function mediaKeys(assets) {
  return assets.flatMap((asset) => JSON.parse(String(asset.variants_json)).map((variant) => variant.key));
}

const ids = adminIds();
if (ids.size === 0)
  throw new Error(`No admin user in ${STATE}. Run the demo build (npm run demo:build) first.`);

const tables = Object.fromEntries(
  SNAPSHOT_TABLES.map((table) => [table, rewriteAdmins(readTable(table), ids)]),
);
// Only the committed snapshot must keep the banner; a test writes its own scratch file from a store with default settings.
if (!process.env.DEMO_SNAPSHOT_FILE) assertBannerAlways(tables.settings);
const body = { accountId: DEMO_ACCOUNT_ID, tables, media: mediaKeys(tables.media_assets) };
// The version changes whenever the content does, so the store knows it has a new snapshot to restore.
const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
const snapshot = { version, takenAt: new Date().toISOString(), ...body };

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
const rows = SNAPSHOT_TABLES.reduce((sum, table) => sum + tables[table].length, 0);
console.log(
  `snapshot ${version}: ${rows} rows in ${SNAPSHOT_TABLES.length} tables, ${snapshot.media.length} images -> ${OUT}`,
);
