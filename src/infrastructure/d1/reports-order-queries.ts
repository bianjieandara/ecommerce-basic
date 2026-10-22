// Report reads over orders: sales by day, tax by day and rate, payment methods and shipping methods. Each read sends its
// independent statements in one batch; the day groups are merged in code, which costs nothing per row against the database.
import type {
  PaymentMethodRow,
  ReportFilters,
  ReportRange,
  SalesDay,
  ShippingRow,
  TaxDay,
} from '@/application/reports/ports';
import { offsetMinutes } from './dashboard-days';
import { statement } from './d1-client';
import { localDayExpr, paidInRange } from './reports-sql';

/** Row of the sales statement (paid orders by day). */
interface PaidDayRow {
  day: string;
  orders: number;
  revenue: number;
  tax: number;
  shipping: number;
}

/**
 * Sales by store-local day: paid orders, their units and their refunds (refunded orders, by the time they were paid).
 * @param db D1 database.
 * @param range The period.
 * @param timeZone Store time zone.
 * @returns One row per day with activity, oldest first.
 */
export async function salesDays(db: D1Database, range: ReportRange, timeZone: string): Promise<SalesDay[]> {
  const day = localDayExpr('o.paid_at', offsetMinutes(range.startIso, timeZone));
  const paid = paidInRange(range);
  const results = await db.batch([
    statement(
      db,
      `SELECT ${day} AS day, COUNT(*) AS orders, SUM(o.total_minor) AS revenue, SUM(o.tax_minor) AS tax,
              SUM(o.shipping_minor) AS shipping
       FROM orders o WHERE ${paid.sql} GROUP BY day ORDER BY day ASC`,
      paid.binds,
    ),
    statement(
      db,
      `SELECT ${day} AS day, SUM(oi.quantity) AS units
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE ${paid.sql} GROUP BY day ORDER BY day ASC`,
      paid.binds,
    ),
    statement(
      db,
      `SELECT ${day} AS day, COUNT(*) AS orders, SUM(o.total_minor) AS amount
       FROM orders o WHERE o.status = 'refunded' AND o.paid_at >= ? AND o.paid_at < ? GROUP BY day ORDER BY day ASC`,
      [range.startIso, range.endIso],
    ),
  ]);
  const sales = (results[0]?.results ?? []) as PaidDayRow[];
  const units = new Map(
    ((results[1]?.results ?? []) as { day: string; units: number }[]).map((r) => [r.day, r.units]),
  );
  const refunds = new Map(
    ((results[2]?.results ?? []) as { day: string; orders: number; amount: number }[]).map((r) => [r.day, r]),
  );
  const days = new Map<string, SalesDay>();
  const dayFor = (key: string): SalesDay => {
    const existing = days.get(key);
    if (existing) return existing;
    const fresh = emptySalesDay(key);
    days.set(key, fresh);
    return fresh;
  };
  for (const row of sales) {
    Object.assign(dayFor(row.day), {
      orders: row.orders,
      revenueMinor: row.revenue,
      taxMinor: row.tax,
      shippingMinor: row.shipping,
      units: units.get(row.day) ?? 0,
    });
  }
  for (const [key, refund] of refunds) {
    Object.assign(dayFor(key), { refundOrders: refund.orders, refundMinor: refund.amount });
  }
  return [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

/**
 * A sales day with nothing in it yet.
 * @param day Store-local day.
 * @returns The zeroed row.
 */
function emptySalesDay(day: string): SalesDay {
  return {
    day,
    orders: 0,
    units: 0,
    revenueMinor: 0,
    taxMinor: 0,
    shippingMinor: 0,
    refundOrders: 0,
    refundMinor: 0,
  };
}

/**
 * Tax by store-local day and rate, as the invoices compute it: the base is the amount without tax, and shipping tax (what the
 * order's tax holds beyond its lines) is booked at the store's default rate.
 * @param db D1 database.
 * @param range The period.
 * @param timeZone Store time zone.
 * @param filters Uses the default rate.
 * @returns One row per day and rate, oldest first.
 */
export async function taxDays(
  db: D1Database,
  range: ReportRange,
  timeZone: string,
  filters: ReportFilters,
): Promise<TaxDay[]> {
  const day = localDayExpr('o.paid_at', offsetMinutes(range.startIso, timeZone));
  const paid = paidInRange(range);
  const [result] = await db.batch([
    statement(
      db,
      `WITH paid AS (
         SELECT o.id AS id, o.prices_include_tax AS inc, o.shipping_minor AS ship, o.tax_minor AS tax, ${day} AS day
         FROM orders o WHERE ${paid.sql}
       )
       SELECT day, rate, SUM(base) AS base, SUM(taxes) AS taxes FROM (
         SELECT p.day AS day, oi.tax_rate_bp AS rate,
                CASE WHEN p.inc = 1 THEN oi.line_total_minor - oi.tax_minor ELSE oi.line_total_minor END AS base,
                oi.tax_minor AS taxes
         FROM paid p JOIN order_items oi ON oi.order_id = p.id
         UNION ALL
         SELECT s.day, ?, CASE WHEN s.inc = 1 THEN s.ship - s.ship_tax ELSE s.ship END, s.ship_tax
         FROM (
           SELECT p.day AS day, p.inc AS inc, p.ship AS ship,
                  p.tax - COALESCE((SELECT SUM(oi.tax_minor) FROM order_items oi WHERE oi.order_id = p.id), 0) AS ship_tax
           FROM paid p
         ) s WHERE s.ship_tax > 0
       )
       GROUP BY day, rate ORDER BY day ASC, rate ASC`,
      [...paid.binds, filters.defaultRateBp],
    ),
  ]);
  return ((result?.results ?? []) as { day: string; rate: number; base: number; taxes: number }[]).map(
    (row) => ({
      day: row.day,
      rateBp: row.rate,
      baseMinor: row.base,
      taxMinor: row.taxes,
    }),
  );
}

/**
 * Payment methods over the period. Money and paid counts are by payment time; placed, converted and pending are by placement
 * time, so the conversion is the share of the orders placed in the period that were paid.
 * @param db D1 database.
 * @param range The period.
 * @returns One row per payment method that has orders.
 */
export async function paymentMethods(db: D1Database, range: ReportRange): Promise<PaymentMethodRow[]> {
  const paid = paidInRange(range);
  const results = await db.batch([
    statement(
      db,
      `SELECT o.payment_method AS method, COUNT(*) AS paid, SUM(o.total_minor) AS revenue
       FROM orders o WHERE ${paid.sql} GROUP BY o.payment_method ORDER BY o.payment_method ASC`,
      paid.binds,
    ),
    statement(
      db,
      `SELECT o.payment_method AS method, COUNT(*) AS refunded, SUM(o.total_minor) AS amount
       FROM orders o WHERE o.status = 'refunded' AND o.paid_at >= ? AND o.paid_at < ?
       GROUP BY o.payment_method ORDER BY o.payment_method ASC`,
      [range.startIso, range.endIso],
    ),
    statement(
      db,
      `SELECT o.payment_method AS method, COUNT(*) AS placed,
              SUM(CASE WHEN o.paid_at IS NOT NULL THEN 1 ELSE 0 END) AS converted,
              SUM(CASE WHEN o.status = 'pending_payment' THEN 1 ELSE 0 END) AS pending
       FROM orders o WHERE o.created_at >= ? AND o.created_at < ?
       GROUP BY o.payment_method ORDER BY o.payment_method ASC`,
      [range.startIso, range.endIso],
    ),
  ]);
  const byMethod = new Map<string, PaymentMethodRow>();
  const rowFor = (method: string): PaymentMethodRow => {
    const existing = byMethod.get(method);
    if (existing) return existing;
    const fresh: PaymentMethodRow = {
      method,
      paidOrders: 0,
      revenueMinor: 0,
      refundedOrders: 0,
      refundedMinor: 0,
      placed: 0,
      converted: 0,
      pending: 0,
    };
    byMethod.set(method, fresh);
    return fresh;
  };
  for (const row of (results[0]?.results ?? []) as { method: string; paid: number; revenue: number }[]) {
    Object.assign(rowFor(row.method), { paidOrders: row.paid, revenueMinor: row.revenue });
  }
  for (const row of (results[1]?.results ?? []) as { method: string; refunded: number; amount: number }[]) {
    Object.assign(rowFor(row.method), { refundedOrders: row.refunded, refundedMinor: row.amount });
  }
  for (const row of (results[2]?.results ?? []) as {
    method: string;
    placed: number;
    converted: number;
    pending: number;
  }[]) {
    Object.assign(rowFor(row.method), { placed: row.placed, converted: row.converted, pending: row.pending });
  }
  return [...byMethod.values()].sort((a, b) => a.method.localeCompare(b.method));
}

/**
 * Shipping methods over the period (paid orders, by payment time). The method's name is the one the order stored.
 * @param db D1 database.
 * @param range The period.
 * @returns One row per method, largest shipping income first.
 */
export async function shippingMethods(db: D1Database, range: ReportRange): Promise<ShippingRow[]> {
  const paid = paidInRange(range);
  const [result] = await db.batch([
    statement(
      db,
      `SELECT o.shipping_method_name AS name, COUNT(*) AS orders, SUM(o.shipping_minor) AS shipping,
              SUM(CASE WHEN o.shipping_minor = 0 THEN 1 ELSE 0 END) AS free
       FROM orders o WHERE ${paid.sql}
       GROUP BY o.shipping_method_name ORDER BY shipping DESC, name ASC LIMIT 50`,
      paid.binds,
    ),
  ]);
  return ((result?.results ?? []) as { name: string; orders: number; shipping: number; free: number }[]).map(
    (row) => ({ name: row.name, orders: row.orders, shippingMinor: row.shipping, freeOrders: row.free }),
  );
}
