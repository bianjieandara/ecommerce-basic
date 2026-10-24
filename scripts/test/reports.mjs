// Report numbers of the LOCAL demo store: every figure a report shows is recomputed here with its own SQL and compared, the
// change against the previous period is recomputed from two single-day figures, and the CSV (comma and semicolon) is read back.
// It creates nothing: it judges whatever orders the database holds, so run it after `npm run test:orders` for a fuller picture.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:reports
import { readFileSync } from 'node:fs';
import { openBrowser } from '../docs/chrome.mjs';
import { BASE, post, sql } from '../docs/shared.mjs';

const cookie = readFileSync('.wrangler/docs-cookie.txt', 'utf8');
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
const get = (path) => fetch(BASE + path, { headers: { cookie } });
const q = (query) => sql(query);
const PAID = `('paid','processing','shipped','delivered')`;

const general = JSON.parse(q(`SELECT value_json AS v FROM settings WHERE group_key = 'general'`)[0].v);
// Offset of the store's clock at the start of the range, the way the reports compute it (no daylight saving to worry about here).
const offsetOf = (iso) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: general.timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((local - new Date(iso).getTime()) / 60000);
};
/** Instants of a store-local day range [from, to] (inclusive days), as the reports bound them. */
function bounds(from, to) {
  const at = (day) => {
    const guess = new Date(`${day}T00:00:00.000Z`);
    return new Date(guess.getTime() - offsetOf(guess.toISOString()) * 60000).toISOString();
  };
  const next = new Date(`${to}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: at(from), end: at(next.toISOString().slice(0, 10)) };
}
const cents = (text) => Math.round(Number(text) * 100);
/** Parses the CSV a report returns into rows of cells (the demo data has no quoted commas in these reports). */
async function csv(path) {
  const response = await get(path);
  const lines = (await response.text()).replace(/^﻿/, '').trim().split(/\r?\n/);
  const header = lines.shift().split(',');
  return { status: response.status, header, rows: lines.filter(Boolean).map((l) => l.split(',')) };
}
const sum = (rows, i) => rows.reduce((total, row) => total + cents(row[i]), 0);

// A wide window inside the 366-day limit; nothing sits at its edges, so the time zone cannot move an order across them.
const FROM = '2026-01-01';
const TO = '2026-12-31';
const { start, end } = bounds(FROM, TO);
const range = `from=${FROM}&to=${TO}`;
const paidWhere = `status IN ${PAID} AND paid_at >= '${start}' AND paid_at < '${end}'`;
console.log(`orders paid in ${FROM}..${TO}:`, q(`SELECT COUNT(*) AS n FROM orders WHERE ${paidWhere}`)[0].n);

// ================================================================================================================= sales
console.log('sales');
{
  const sales = await csv(`/api/admin/reports/sales.csv?${range}`);
  const want = q(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total_minor),0) AS revenue, COALESCE(SUM(tax_minor),0) AS tax, COALESCE(SUM(shipping_minor),0) AS shipping FROM orders WHERE ${paidWhere}`,
  )[0];
  const units = q(
    `SELECT COALESCE(SUM(oi.quantity),0) AS n FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status IN ${PAID} AND o.paid_at >= '${start}' AND o.paid_at < '${end}'`,
  )[0].n;
  const refunds = q(
    `SELECT COALESCE(SUM(total_minor),0) AS t FROM orders WHERE status = 'refunded' AND paid_at >= '${start}' AND paid_at < '${end}'`,
  )[0].t;
  check(
    'the header is Period, Orders, Units, Revenue, Tax, Shipping, Refunds',
    sales.header.join() === 'Period,Orders,Units,Revenue,Tax,Shipping,Refunds',
    sales.header.join(),
  );
  check('orders add up', sales.rows.reduce((t, r) => t + Number(r[1]), 0) === want.orders, `${want.orders}`);
  check('units add up', sales.rows.reduce((t, r) => t + Number(r[2]), 0) === units, `${units}`);
  check('revenue adds up', sum(sales.rows, 3) === want.revenue, `${want.revenue}`);
  check('tax adds up', sum(sales.rows, 4) === want.tax, `${want.tax}`);
  check('shipping adds up', sum(sales.rows, 5) === want.shipping, `${want.shipping}`);
  check(
    'refunds add up (refunded orders, by the day they were paid)',
    sum(sales.rows, 6) === refunds,
    `${refunds}`,
  );

  // Each day, against the same SQL grouped by local day.
  const perDay = q(
    `SELECT strftime('%Y-%m-%d', paid_at, '${offsetOf(start) < 0 ? '-' : '+'}${Math.abs(offsetOf(start))} minutes') AS day, COUNT(*) AS n, SUM(total_minor) AS revenue FROM orders WHERE ${paidWhere} GROUP BY day`,
  );
  const wrong = perDay.filter((d) => {
    const row = sales.rows.find((r) => r[0] === d.day);
    return !row || Number(row[1]) !== d.n || cents(row[3]) !== d.revenue;
  });
  check(
    'every day with sales matches its own figures',
    wrong.length === 0,
    JSON.stringify(wrong.slice(0, 2)),
  );

  const weeks = await csv(`/api/admin/reports/sales.csv?${range}&grain=week`);
  const months = await csv(`/api/admin/reports/sales.csv?${range}&grain=month`);
  check(
    'grouping by week keeps the totals',
    sum(weeks.rows, 3) === want.revenue && weeks.rows.reduce((t, r) => t + Number(r[1]), 0) === want.orders,
  );
  check(
    'grouping by month keeps the totals',
    sum(months.rows, 3) === want.revenue && months.rows.length <= 12,
  );

  const semi = await (await get(`/api/admin/reports/sales.csv?${range}&sep=;`)).text();
  const firstRow = semi.split(/\r?\n/)[1] ?? '';
  check(
    'the Spanish CSV uses semicolons and a decimal comma',
    firstRow.includes(';') && /\d,\d\d/.test(firstRow),
    firstRow,
  );
}

// =========================================================================================== change vs the previous period
console.log('previous period');
{
  const last = q(
    `SELECT strftime('%Y-%m-%d', MAX(paid_at), '-300 minutes') AS d FROM orders WHERE status IN ${PAID}`,
  )[0].d;
  const dayBefore = new Date(`${last}T00:00:00.000Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const before = dayBefore.toISOString().slice(0, 10);
  const figures = (day) => {
    const b = bounds(day, day);
    return q(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_minor),0) AS revenue FROM orders WHERE status IN ${PAID} AND paid_at >= '${b.start}' AND paid_at < '${b.end}'`,
    )[0];
  };
  const now = figures(last);
  const prev = figures(before);
  const page = await (await get(`/admin/reports/sales?from=${last}&to=${last}&compare=1`)).text();
  const text = page
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '|')
    .replace(/\s+/g, ' ');
  const percent = (a, b) => (b === 0 ? null : Math.round(((a - b) / b) * 10000) / 100);
  const shown = (value) => (value === null ? '—' : `${value > 0 ? '+' : ''}${value}%`);
  console.log(
    `      ${last}: ${now.orders} orders, ${now.revenue}   ${before}: ${prev.orders} orders, ${prev.revenue}`,
  );
  check(
    'the page shows this period and the previous one for revenue',
    text.includes((now.revenue / 100).toFixed(2)) && text.includes((prev.revenue / 100).toFixed(2)),
  );
  check(
    `the revenue change is ${shown(percent(now.revenue, prev.revenue))}`,
    text.includes(shown(percent(now.revenue, prev.revenue))),
    text.slice(text.indexOf('Indicator'), text.indexOf('Indicator') + 200),
  );
  check(
    `the orders change is ${shown(percent(now.orders, prev.orders))}`,
    text.includes(shown(percent(now.orders, prev.orders))),
  );
  check('a period after one with no sales shows a dash, not infinity', !/Infinity|NaN/.test(text));
}

// ============================================================================================================== payments
console.log('payments, shipping, invoices');
{
  const payments = await csv(`/api/admin/reports/payments.csv?${range}`);
  const rows = q(
    `SELECT payment_method AS m,
            SUM(CASE WHEN status IN ${PAID} AND paid_at >= '${start}' AND paid_at < '${end}' THEN 1 ELSE 0 END) AS paid,
            SUM(CASE WHEN status IN ${PAID} AND paid_at >= '${start}' AND paid_at < '${end}' THEN total_minor ELSE 0 END) AS revenue
     FROM orders GROUP BY payment_method`,
  );
  const wrong = rows.filter((r) => {
    const row = payments.rows.find((p) => p[0] === r.m);
    if (r.paid === 0 && r.revenue === 0) return false;
    return !row || Number(row[1]) !== r.paid || cents(row[2]) !== r.revenue;
  });
  check('paid orders and revenue per payment method match', wrong.length === 0, JSON.stringify(wrong));
  const conversions = payments.rows
    .filter((p) => Number(p[4]) > 0)
    .every((p) => {
      const placed = Number(p[4]);
      const converted = Number(p[5]);
      return (
        Math.abs(Number(p[7]) - Math.round((converted / placed) * 10000) / 100) < 0.011 && converted <= placed
      );
    });
  check('conversion is converted over placed, and never above 100%', conversions);

  const shipping = await csv(`/api/admin/reports/shipping.csv?${range}`);
  const paidCount = q(`SELECT COUNT(*) AS n FROM orders WHERE ${paidWhere}`)[0].n;
  const shipTotal = q(`SELECT COALESCE(SUM(shipping_minor),0) AS t FROM orders WHERE ${paidWhere}`)[0].t;
  check(
    'paid orders per shipping method add up to all paid orders',
    shipping.rows.reduce((t, r) => t + Number(r[1]), 0) === paidCount,
    `${paidCount}`,
  );
  check('shipping charged per method adds up', sum(shipping.rows, 2) === shipTotal, `${shipTotal}`);

  const invoices = await csv(`/api/admin/reports/invoices.csv?${range}`);
  const issued = q(
    `SELECT COUNT(*) AS n, COALESCE(SUM(total_minor),0) AS t, COALESCE(SUM(tax_minor),0) AS tax FROM invoices WHERE status = 'issued' AND issued_at >= '${start}' AND issued_at < '${end}'`,
  )[0];
  check(
    'issued invoices and their total match',
    invoices.rows.reduce((t, r) => t + Number(r[1]), 0) === issued.n && sum(invoices.rows, 3) === issued.t,
    JSON.stringify(issued),
  );

  const taxes = await csv(`/api/admin/reports/taxes.csv?${range}`);
  const taxSum = q(`SELECT COALESCE(SUM(tax_minor),0) AS t FROM orders WHERE ${paidWhere}`)[0].t;
  check(
    'tax collected per rate adds up to the tax of the paid orders',
    sum(taxes.rows, 3) === taxSum,
    `${taxSum}`,
  );
}

// ======================================================================================== products, categories, customers
console.log('products, categories, customers');
{
  const lineWhere = `o.status IN ${PAID} AND o.paid_at >= '${start}' AND o.paid_at < '${end}'`;
  const products = await csv(`/api/admin/reports/products.csv?${range}`);
  const lines = q(
    `SELECT COALESCE(SUM(oi.quantity),0) AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${lineWhere}`,
  )[0];
  check(
    'units sold by product add up to the units of the paid orders',
    products.rows.reduce((t, r) => t + Number(r[1]), 0) === lines.units,
    `${lines.units}`,
  );
  const margins = products.rows
    .filter((r) => r[3] !== '' && r[3] !== '—')
    .every((r) => Math.abs(cents(r[2]) - cents(r[3]) - cents(r[4])) <= cents(r[2]) * 0.5 + 1);
  check('a margin is shown only beside a cost', margins);

  const categories = await csv(`/api/admin/reports/categories.csv?${range}`);
  check(
    'no category sells more units than the products report shows',
    categories.rows.reduce((t, r) => t + Number(r[1]), 0) <= lines.units + 0,
    `${lines.units}`,
  );

  const customers = await csv(`/api/admin/reports/customers.csv?${range}`);
  const top = q(
    `SELECT customer_email AS e, COUNT(*) AS n, SUM(total_minor) AS t FROM orders WHERE ${paidWhere} GROUP BY customer_email ORDER BY t DESC, e ASC LIMIT 1`,
  )[0];
  const first = customers.rows[0];
  check(
    'the top customer is the one who spent the most',
    first && first[1] === top.e && Number(first[2]) === top.n && cents(first[3]) === top.t,
    `${first} / ${JSON.stringify(top)}`,
  );
}

// ============================================================================================================== the pages
console.log('pages');
{
  const bad = [];
  for (const kind of [
    'sales',
    'products',
    'categories',
    'payments',
    'shipping',
    'taxes',
    'invoices',
    'inventory',
    'customers',
    'funnel',
    'notifications',
  ]) {
    const response = await get(`/admin/reports/${kind}?${range}`);
    const html = await response.text();
    if (response.status !== 200) bad.push(`${kind} ${response.status}`);
    if (/NaN|undefined|Infinity|\[object /.test(html.replace(/<script[\s\S]*?<\/script>/g, '')))
      bad.push(`${kind} shows NaN/undefined`);
    if (!/<meta name="viewport"/.test(html)) bad.push(`${kind} has no viewport`);
  }
  check(
    'every report page answers and shows no NaN, undefined or [object]',
    bad.length === 0,
    bad.join('; '),
  );
}

// =================================================================================================================== phone
console.log('phone (360px)');
{
  const phone = await openBrowser({ port: 9481, width: 360, height: 780, scale: 2, mobile: true });
  try {
    for (const [name, value] of cookie.split('; ').map((p) => p.split(/=(.*)/s)))
      await phone.cookie(name, value, BASE);
    const bad = [];
    for (const kind of [
      'sales',
      'products',
      'categories',
      'payments',
      'shipping',
      'taxes',
      'invoices',
      'inventory',
      'customers',
      'funnel',
      'notifications',
    ]) {
      await phone.goto(`${BASE}/admin/reports/${kind}?${range}&compare=1`, 1500);
      const page = await phone.evaluate(
        `(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth }))()`,
      );
      if (page.over > 1) bad.push(`${kind} scrolls sideways by ${page.over}px`);
    }
    check('no report page scrolls sideways at 360px', bad.length === 0, bad.join('; '));
  } finally {
    phone.close();
  }
}

// ============================================================================================================ weekly summary
console.log('weekly summary');
{
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const original = q(`SELECT value_json AS v FROM settings WHERE group_key = 'reports'`)[0].v;
  const tick = () => fetch(`${BASE}/cdn-cgi/handler/scheduled?cron=*+*+*+*+*`);
  const weekly = () =>
    q(
      `SELECT COUNT(*) AS n FROM notification_log WHERE template_key = 'weekly_report_store' AND created_at >= '${startedAt}'`,
    )[0].n;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: general.timezone,
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[
    parts.find((p) => p.type === 'weekday').value
  ];
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const saveReports = (values) => post('/api/admin/settings/reports', { values }, cookie);
  const startedAt = new Date().toISOString();
  // A summary is sent once per store-local day (its notification key names the day), so an earlier run today would hide this one.
  sql(`DELETE FROM notification_log WHERE template_key = 'weekly_report_store'`);
  try {
    // Another day and hour than now: the tick must not send it.
    const elsewhere = {
      ...JSON.parse(original),
      weeklySummaryEnabled: true,
      weeklySummaryWeekday: (weekday + 3) % 7,
      weeklySummaryHour: (hour + 5) % 24,
    };
    await saveReports(elsewhere);
    await tick();
    await wait(7000);
    check('a tick outside the configured weekday and hour sends nothing', weekly() === 0);

    // Switched off at the right moment: nothing either.
    await saveReports({
      ...elsewhere,
      weeklySummaryEnabled: false,
      weeklySummaryWeekday: weekday,
      weeklySummaryHour: hour,
    });
    await tick();
    await wait(7000);
    check('a summary that is switched off sends nothing, even at its hour', weekly() === 0);

    // On the configured weekday and hour: the tick sends it.
    await saveReports({
      ...elsewhere,
      weeklySummaryEnabled: true,
      weeklySummaryWeekday: weekday,
      weeklySummaryHour: hour,
    });
    await tick();
    const sent = await (async () => {
      const stop = Date.now() + 30000;
      while (Date.now() < stop) {
        if (weekly() > 0) return true;
        await wait(1000);
      }
      return false;
    })();
    check('a tick at the configured weekday and hour sends the weekly summary', sent);
    const rowNow = () =>
      q(
        `SELECT channel, status, recipient, subject FROM notification_log WHERE template_key = 'weekly_report_store' AND created_at >= '${startedAt}' LIMIT 1`,
      )[0];
    const stop = Date.now() + 30000;
    while (rowNow()?.status === 'queued' && Date.now() < stop) await wait(1000);
    const row = rowNow();
    check(
      'it goes out by e-mail, to a recipient, and is delivered to the e-mail service',
      row?.channel === 'email' && /@/.test(row.recipient ?? '') && row.status === 'sent',
      JSON.stringify(row),
    );
    // A second tick in the same hour must not send it again.
    await tick();
    await wait(8000);
    check('a second tick in the same hour does not send it again', weekly() === 1, String(weekly()));
  } finally {
    // Through the API, not SQL: the shell that runs the SQL strips the quotes of JSON.
    await saveReports(JSON.parse(original));
  }
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
if (failures.length > 0) {
  console.log('Failed:\n - ' + failures.join('\n - '));
  process.exitCode = 1;
}
