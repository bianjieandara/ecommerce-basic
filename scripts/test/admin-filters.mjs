// Filter test of the LOCAL demo store's admin lists: orders, products, inventory, invoices, stock movements and the log lists. For each
// list it works out from the database what every filter and combination must show, reads every page of the real list as the owner, and
// compares the rows (and their order where the order is a rule). Read-only: nothing is changed.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:admin-filters
import { readFileSync } from 'node:fs';
import { BASE, sql } from '../docs/shared.mjs';

const cookie = readFileSync('.wrangler/docs-cookie.txt', 'utf8');
const PAGE = 25;
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
  if (!ok) failures.push(`${name}${detail ? '  -> ' + detail : ''}`);
}

// ------------------------------------------------------------------------------------------------------------------ helpers
const general = JSON.parse(sql("SELECT value_json FROM settings WHERE group_key = 'general'")[0].value_json);
const inventorySettings = JSON.parse(
  sql("SELECT value_json FROM settings WHERE group_key = 'inventory'")[0]?.value_json ?? '{}',
);
const DEFAULT_LOW = inventorySettings.defaultLowStockThreshold ?? 3;
const TZ = general.timezone || 'UTC';

/** Offset of a time zone from UTC at an instant, in milliseconds. */
function offsetMs(ts) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(ts)
      .map((p) => [p.type, Number(p.value)]),
  );
  // The local wall-clock time read as if it were UTC, minus the real UTC time (to the second), is the zone's offset.
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    Math.floor(ts / 1000) * 1000
  );
}
/** First instant of a local calendar day in the store's time zone. */
function dayStart(day) {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(guess);
  t = guess - offsetMs(t);
  return t;
}
const nextDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
/** Local calendar day of an ISO instant. */
const localDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));

/**
 * Reads every page of an admin list and returns what a row-reader pulls out of it.
 * @param path Page path.
 * @param query Query string without "?".
 * @param read Function from HTML to an array of row keys.
 * @returns The rows in the order shown, plus the status of the first page.
 */
async function readAll(path, query, read) {
  const rows = [];
  let status = 0;
  for (let page = 1; page <= 40; page += 1) {
    const q = new URLSearchParams(query);
    if (page > 1) q.set('page', String(page));
    const response = await fetch(`${BASE}${path}${q.toString() ? '?' + q : ''}`, {
      headers: { cookie },
      redirect: 'manual',
    });
    if (page === 1) status = response.status;
    if (response.status !== 200) break;
    const got = read(await response.text());
    const fresh = got.filter((row) => !rows.includes(row));
    rows.push(...got);
    if (got.length < PAGE || fresh.length === 0) break;
  }
  return { rows, status };
}
const unique = (list) => [...new Set(list)];
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const matches = (hay, needle) => hay.toLowerCase().includes(needle.toLowerCase());

// -------------------------------------------------------------------------------------------------------------------- orders
const orders = sql(
  'SELECT number, status, payment_method AS method, customer_name AS name, customer_email AS email, customer_phone AS phone, created_at AS created FROM orders',
);
const readOrders = (html) => unique([...html.matchAll(/href="\/admin\/orders\/(\d+)"/g)].map((m) => m[1]));

/** Orders a filter must show, newest first. */
function expectedOrders(f) {
  return orders
    .filter((o) => !f.status || o.status === f.status)
    .filter((o) => !f.method || o.method === f.method)
    .filter((o) => !f.from || Date.parse(o.created) >= dayStart(f.from))
    .filter((o) => !f.to || Date.parse(o.created) < dayStart(nextDay(f.to)))
    .filter((o) => {
      if (!f.q) return true;
      if (/^\d{1,12}$/.test(f.q)) return String(o.number) === f.q || matches(o.phone ?? '', f.q);
      return matches(o.name ?? '', f.q) || matches(o.email ?? '', f.q) || matches(o.phone ?? '', f.q);
    })
    .sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : b.number - a.number))
    .map((o) => String(o.number));
}
/** Compares one order filter. */
async function ordersCase(label, f) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries({ status: f.status, method: f.method, from: f.from, to: f.to, q: f.q }).filter(
        ([, v]) => v,
      ),
    ),
  );
  const { rows, status } = await readAll('/admin/orders', query, readOrders);
  const want = expectedOrders(f);
  check(`[orders] ${label}: answers 200`, status === 200, String(status));
  check(
    `[orders] ${label}: same orders, newest first`,
    JSON.stringify(rows) === JSON.stringify(want),
    `want ${want.length} (${want.slice(0, 4)}...) got ${rows.length} (${rows.slice(0, 4)}...)`,
  );
}
const days = unique(orders.map((o) => localDay(o.created))).sort();
const sample = orders.find((o) => o.name && o.email) ?? orders[0];
for (const status of unique(orders.map((o) => o.status))) await ordersCase(`status ${status}`, { status });
for (const method of unique(orders.map((o) => o.method))) await ordersCase(`method ${method}`, { method });
await ordersCase('no filter', {});
await ordersCase('from the first day', { from: days[0] });
await ordersCase('to the last day', { to: days[days.length - 1] });
await ordersCase('one single day', { from: days[days.length - 1], to: days[days.length - 1] });
await ordersCase('a range with nothing in it', { from: '2001-01-01', to: '2001-12-31' });
await ordersCase('from after to (empty)', { from: '2030-01-02', to: '2030-01-01' });
await ordersCase('search by number', { q: String(sample.number) });
await ordersCase('search by name', { q: sample.name.split(' ')[0] });
await ordersCase('search by name, upper case', { q: sample.name.split(' ')[0].toUpperCase() });
await ordersCase('search by email part', { q: sample.email.split('@')[1] });
await ordersCase('search by phone digits', { q: (sample.phone ?? '').replace(/\D/g, '').slice(-6) });
await ordersCase('search for a literal %', { q: '%' });
await ordersCase('search for a literal _', { q: '_' });
await ordersCase('search with nothing found', { q: 'zzzz-no-such-customer' });
// D1 refuses a LIKE pattern over 50 bytes; a long search must still work and still find what it should.
await ordersCase('a search of 60 characters', { q: 'x'.repeat(60) });
await ordersCase('a search of 300 characters', { q: 'x'.repeat(300) });
await ordersCase('a long search that matches (the full email)', { q: `${sample.email}` });
await ordersCase('a long phone-like number', { q: '9'.repeat(30) });
await ordersCase('status + method', { status: 'paid', method: 'bank_transfer' });
await ordersCase('status + search + day', { status: 'paid', q: 'a', from: days[0] });
for (const bad of [
  'status=nope',
  'method=nope',
  'from=not-a-date',
  'page=-3',
  'page=abc',
  'q=' + 'x'.repeat(300),
]) {
  const r = await fetch(`${BASE}/admin/orders?${bad}`, { headers: { cookie } });
  check(`[orders] nonsense "${bad.slice(0, 24)}" still shows a page`, r.status === 200, String(r.status));
}

// ------------------------------------------------------------------------------------------------------------------ products
const products = sql('SELECT id, status, is_on_sale AS sale FROM products');
const productTextByLocale = sql('SELECT product_id AS id, locale, name FROM product_translations');
const productText = sql(
  'SELECT product_id AS id, name, short_description AS short FROM product_translations',
);
const productCats = sql('SELECT product_id AS id, category_id AS cat FROM product_categories');
const variants = sql(
  'SELECT id, product_id AS pid, sku, barcode, is_active AS active, track_inventory AS tracked, stock, low_stock_threshold AS low, position, price_minor AS price FROM product_variants',
);
const base = Object.fromEntries(
  sql('SELECT id, base_price_minor AS price FROM products').map((p) => [p.id, p.price]),
);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s) =>
  norm(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const outOfStock = (id) =>
  !variants.some((v) => v.pid === id && v.active === 1 && (v.tracked === 0 || v.stock > 0));
const readProducts = (html) =>
  unique(
    [...html.matchAll(/href="\/admin\/products\/([^"/?]+)"/g)].map((m) => m[1]).filter((id) => id !== 'new'),
  );

/** Products an admin filter must show. */
function expectedProducts(f) {
  return products
    .filter((p) => !f.status || p.status === f.status)
    .filter((p) => !f.category || productCats.some((c) => c.id === p.id && c.cat === f.category))
    .filter((p) => !f.sale || p.sale === 1)
    .filter((p) => !f.stock || outOfStock(p.id))
    .filter((p) => {
      if (!f.q) return true;
      const tokens = words(f.q);
      if (tokens.length === 0) return true;
      const w = productText.filter((t) => t.id === p.id).flatMap((t) => words(`${t.name} ${t.short ?? ''}`));
      return tokens.every((t) => w.some((x) => x.startsWith(t)));
    })
    .map((p) => p.id);
}
/** Compares one product filter (the set; the list order is by last update). */
async function productsCase(label, f) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries({
        status: f.status,
        category: f.category,
        sale: f.sale ? '1' : '',
        stock: f.stock ? '1' : '',
        q: f.q,
      }).filter(([, v]) => v),
    ),
  );
  const { rows, status } = await readAll('/admin/products', query, readProducts);
  const want = expectedProducts(f);
  check(
    `[products] ${label}`,
    status === 200 && same(rows, want),
    `status ${status}; want ${want.length} (${want.slice(0, 4)}) got ${rows.length} (${rows.slice(0, 4)})`,
  );
}
await productsCase('no filter', {});
for (const status of ['draft', 'active', 'archived']) await productsCase(`status ${status}`, { status });
for (const cat of unique(productCats.map((c) => c.cat)))
  await productsCase(`category ${cat}`, { category: cat });
await productsCase('on sale', { sale: true });
await productsCase('out of stock', { stock: true });
await productsCase('search by name', { q: words(productText[0].name)[0] });
await productsCase('search upper case', { q: productText[0].name.toUpperCase() });
await productsCase('search with nothing found', { q: 'zzzz' });
await productsCase('a very long search', { q: 'x'.repeat(120) });
await productsCase('category + on sale', { category: 'cat-tees', sale: true });
await productsCase('active + out of stock', { status: 'active', stock: true });
await productsCase('everything at once', {
  status: 'active',
  category: 'cat-acc',
  sale: true,
  stock: true,
  q: 'a',
});

// ---------------------------------------------------------------------------------------------------------------- inventory
const adminLocale = sql('SELECT locale FROM admin_users ORDER BY created_at LIMIT 1')[0]?.locale ?? 'en';
const productNameIn = (id) =>
  [adminLocale, 'es', 'en']
    .map((l) => productTextByLocale.find((t) => t.id === id && t.locale === l)?.name)
    .find(Boolean);
const readInventory = (html) =>
  [...html.matchAll(/data-label="SKU">([^<]*)<\/td><td data-label="Stock"><strong>(-?\d+)<\/strong>/g)].map(
    (m) => `${m[1]}|${m[2]}`,
  );
const statusOf = (v) =>
  v.tracked === 0
    ? 'untracked'
    : v.stock <= 0
      ? 'out'
      : v.stock <= (v.low ?? DEFAULT_LOW)
        ? 'low'
        : 'in_stock';
/** Variants an inventory filter must show, as "sku|stock", in the order of the sort. */
function expectedInventory(f) {
  // Names are shown in the admin's own language, falling back to Spanish, then English, as the list does.
  const nameOf = (v) => (productNameIn(v.pid) ?? '').toLowerCase();
  const price = (v) => v.price ?? base[v.pid] ?? 0;
  const sorters = {
    name: (a, b) =>
      nameOf(a).localeCompare(nameOf(b)) || a.pid.localeCompare(b.pid) || a.position - b.position,
    stock_asc: (a, b) => a.stock - b.stock || a.pid.localeCompare(b.pid) || a.position - b.position,
    stock_desc: (a, b) => b.stock - a.stock || b.pid.localeCompare(a.pid) || b.position - a.position,
    value_desc: (a, b) =>
      b.stock * price(b) - a.stock * price(a) || a.pid.localeCompare(b.pid) || a.position - b.position,
  };
  return variants
    .filter((v) => !f.status || f.status === 'all' || statusOf(v) === f.status)
    .filter((v) => !f.category || productCats.some((c) => c.id === v.pid && c.cat === f.category))
    .filter((v) => {
      if (!f.q) return true;
      const tokens = words(f.q);
      const w = productText.filter((t) => t.id === v.pid).flatMap((t) => words(`${t.name} ${t.short ?? ''}`));
      return (
        matches(v.sku ?? '', f.q) ||
        matches(v.barcode ?? '', f.q) ||
        (tokens.length > 0 && tokens.every((t) => w.some((x) => x.startsWith(t))))
      );
    })
    .sort(sorters[f.sort ?? 'name'])
    .map((v) => `${v.sku}|${v.stock}`);
}
/** Compares one inventory filter, set and order. */
async function inventoryCase(label, f, strictOrder = true) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries({ q: f.q, category: f.category, status: f.status, sort: f.sort }).filter(([, v]) => v),
    ),
  );
  const { rows, status } = await readAll('/admin/inventory', query, readInventory);
  const want = expectedInventory(f);
  check(
    `[inventory] ${label}`,
    status === 200 && (strictOrder ? JSON.stringify(rows) === JSON.stringify(want) : same(rows, want)),
    `status ${status}; want ${want.slice(0, 5)} (${want.length}) got ${rows.slice(0, 5)} (${rows.length})`,
  );
}
await inventoryCase('no filter', {});
for (const status of ['in_stock', 'low', 'out', 'untracked'])
  await inventoryCase(`status ${status}`, { status });
for (const sort of ['name', 'stock_asc', 'stock_desc', 'value_desc'])
  await inventoryCase(`sort ${sort}`, { sort }, sort === 'name' ? false : true);
for (const cat of unique(productCats.map((c) => c.cat)))
  await inventoryCase(`category ${cat}`, { category: cat }, false);
await inventoryCase('search by sku', { q: variants[0].sku }, false);
await inventoryCase('search by part of a sku', { q: (variants[0].sku ?? '').slice(0, 3) }, false);
await inventoryCase('search by product name', { q: words(productText[0].name)[0] }, false);
await inventoryCase('search with nothing found', { q: 'zzzz' }, false);
await inventoryCase('a very long search', { q: 'x'.repeat(120) }, false);
await inventoryCase('status + sort + category', {
  status: 'in_stock',
  sort: 'stock_desc',
  category: 'cat-acc',
});

// ------------------------------------------------------------------------------------------------------------------ invoices
const invoices = sql(
  'SELECT i.id, i.number, i.status, i.series, i.issued_at AS issued, o.number AS orderNumber, o.customer_name AS name, o.customer_email AS email FROM invoices i JOIN orders o ON o.id = i.order_id',
);
const readInvoices = (html) =>
  unique([...html.matchAll(/href="\/admin\/invoices\/([0-9a-f-]{36})"/g)].map((m) => m[1]));
/** Invoices a filter must show. */
function expectedInvoices(f) {
  return invoices
    .filter((i) => !f.status || i.status === f.status)
    .filter((i) => !f.series || i.series === f.series)
    .filter((i) => !f.from || Date.parse(i.issued) >= dayStart(f.from))
    .filter((i) => !f.to || Date.parse(i.issued) < dayStart(nextDay(f.to)))
    .filter(
      (i) =>
        !f.q ||
        (/^\d{1,12}$/.test(f.q)
          ? i.number === Number(f.q) || i.orderNumber === Number(f.q)
          : matches(i.name ?? '', f.q) || matches(i.email ?? '', f.q)),
    )
    .map((i) => i.id);
}
/** Compares one invoice filter (set only). */
async function invoicesCase(label, f) {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries({ status: f.status, series: f.series, from: f.from, to: f.to, q: f.q }).filter(
        ([, v]) => v,
      ),
    ),
  );
  const { rows, status } = await readAll('/admin/invoices', query, readInvoices);
  const want = expectedInvoices(f);
  check(
    `[invoices] ${label}`,
    status === 200 && same(rows, want),
    `status ${status}; want ${want.length} got ${rows.length}`,
  );
}
if (invoices.length > 0) {
  const idays = unique(invoices.map((i) => localDay(i.issued))).sort();
  await invoicesCase('no filter', {});
  for (const status of unique(invoices.map((i) => i.status)))
    await invoicesCase(`status ${status}`, { status });
  for (const series of unique(invoices.map((i) => i.series)))
    await invoicesCase(`series ${series}`, { series });
  await invoicesCase('from the first day', { from: idays[0] });
  await invoicesCase('to the first day', { to: idays[0] });
  await invoicesCase('a range with nothing', { from: '2001-01-01', to: '2001-01-31' });
  await invoicesCase('search by invoice number', { q: String(invoices[0].number) });
  await invoicesCase('search by customer name', { q: (invoices[0].name ?? 'a').split(' ')[0] });
  await invoicesCase('search by email', { q: (invoices[0].email ?? 'a').split('@')[0] });
  await invoicesCase('status + search', { status: 'issued', q: 'a' });
  await invoicesCase('a search of 70 characters', { q: 'y'.repeat(70) });
  await invoicesCase('a long search that matches (the full email)', { q: `${invoices[0].email}` });
}

// ------------------------------------------------------------------------------------------------------------ stock movements
const movements = sql(
  "SELECT m.id, v.sku, m.delta, m.stock_after AS after, m.reason, m.created_at AS created, p_t.name AS name FROM inventory_movements m JOIN product_variants v ON v.id = m.variant_id LEFT JOIN product_translations p_t ON p_t.product_id = v.product_id AND p_t.locale = 'en'",
);
const readMovements = (html) =>
  [
    ...html.matchAll(
      /data-label="SKU">([^<]*)<\/td><td data-label="Change"><strong>([^<]*)<\/strong><\/td><td data-label="Stock after">(-?\d+)/g,
    ),
  ].map((m) => `${m[1]}|${m[2].replace('−', '-').replace('+', '')}|${m[3]}`);
/** Compares one movement filter by the multiset of rows. */
async function movementsCase(label, f) {
  const query = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)));
  const { rows, status } = await readAll('/admin/inventory/movements', query, readMovements);
  const want = movements
    .filter((m) => !f.reason || m.reason === f.reason)
    .filter((m) => !f.from || Date.parse(m.created) >= dayStart(f.from))
    .filter((m) => !f.to || Date.parse(m.created) < dayStart(nextDay(f.to)))
    .filter((m) => !f.q || matches(m.sku ?? '', f.q) || matches(m.name ?? '', f.q))
    .map((m) => `${m.sku}|${m.delta}|${m.after}`);
  // Rows repeat (the same sale twice), so the lists are compared as multisets, and the page walk is capped by the total.
  const count = (list) => list.reduce((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
  check(
    `[movements] ${label}`,
    status === 200 &&
      JSON.stringify(Object.entries(count(rows)).sort()) ===
        JSON.stringify(Object.entries(count(want)).sort()),
    `status ${status}; want ${want.length} got ${rows.length}`,
  );
}
const mdays = unique(movements.map((m) => localDay(m.created))).sort();
await movementsCase('no filter', {});
for (const reason of unique(movements.map((m) => m.reason)))
  await movementsCase(`reason ${reason}`, { reason });
await movementsCase('from the last day', { from: mdays[mdays.length - 1] });
await movementsCase('to the first day', { to: mdays[0] });
await movementsCase('search by sku', { q: movements[0].sku });
await movementsCase('reason + day', { reason: movements[0].reason, from: mdays[0] });

// ------------------------------------------------------------------------------------------------------ log lists: paging only
for (const [path, table] of [
  ['/admin/notification-log', 'notification_log'],
  ['/admin/jobs', 'failed_jobs'],
]) {
  const total = sql(`SELECT COUNT(*) AS n FROM ${table}`)[0].n;
  const rowsOf = (html) => [...html.matchAll(/<tr><td[\s\S]*?<\/tr>/g)].map((m) => m[0].replace(/\s+/g, ' '));
  const seenRows = [];
  for (let page = 1; page <= 30; page += 1) {
    const r = await fetch(`${BASE}${path}?page=${page}`, { headers: { cookie } });
    check(`[${path}] page ${page} answers 200`, r.status === 200, String(r.status));
    const got = rowsOf(await r.text());
    seenRows.push(...got);
    if (got.length < PAGE) break;
  }
  check(
    // Rows can look identical (the same message sent twice in one minute), so the check is the count: every row, none extra.
    `[${path}] paging shows every row, no more`,
    seenRows.length === total,
    `database ${total}, pages ${seenRows.length}`,
  );
  const far = await fetch(`${BASE}${path}?page=9999`, { headers: { cookie }, redirect: 'manual' });
  check(
    `[${path}] a page far past the end does not fail`,
    [200, 301, 302, 404].includes(far.status),
    String(far.status),
  );
}

console.log(`${results.filter(Boolean).length}/${results.length} passed`);
if (failures.length)
  console.log(
    'FAILED:\n' +
      failures
        .slice(0, 60)
        .map((f) => `  ${f}`)
        .join('\n') +
      (failures.length > 60 ? `\n  ... and ${failures.length - 60} more` : ''),
  );
process.exitCode = failures.length ? 1 : 0;
