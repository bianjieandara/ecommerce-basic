// Reports over the back office: invoices by series, the daily counts of the funnel, and the notification log. Read-only.
import type {
  InvoiceSeriesRow,
  MetricsDay,
  NotificationRow,
  ReportFilters,
  ReportRange,
} from '@/application/reports/ports';
import { statement, type SqlValue } from './d1-client';

/** Series of invoices in one report. */
const MAX_SERIES = 100;

/**
 * Invoices by series, by issue time. Issued and voided counts and totals are kept apart; tax counts issued invoices only, as
 * the tax return does.
 * @param db D1 database.
 * @param range The period.
 * @param filters Optional series filter.
 * @returns One row per series, by series code.
 */
export async function invoiceSeries(
  db: D1Database,
  range: ReportRange,
  filters: ReportFilters,
): Promise<InvoiceSeriesRow[]> {
  const conditions = ['issued_at >= ?', 'issued_at < ?'];
  const binds: SqlValue[] = [range.startIso, range.endIso];
  if (filters.series) {
    conditions.push('series = ?');
    binds.push(filters.series);
  }
  const [result] = await db.batch([
    statement(
      db,
      `SELECT series, SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END) AS issued,
              SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END) AS void,
              COALESCE(SUM(CASE WHEN status = 'issued' THEN total_minor END), 0) AS issued_minor,
              COALESCE(SUM(CASE WHEN status = 'void' THEN total_minor END), 0) AS void_minor,
              COALESCE(SUM(CASE WHEN status = 'issued' THEN tax_minor END), 0) AS tax_minor
       FROM invoices WHERE ${conditions.join(' AND ')}
       GROUP BY series ORDER BY series ASC LIMIT ${MAX_SERIES}`,
      binds,
    ),
  ]);
  return (
    (result?.results ?? []) as {
      series: string;
      issued: number;
      void: number;
      issued_minor: number;
      void_minor: number;
      tax_minor: number;
    }[]
  ).map((row) => ({
    series: row.series,
    issued: row.issued,
    void: row.void,
    issuedMinor: row.issued_minor,
    voidMinor: row.void_minor,
    taxMinor: row.tax_minor,
  }));
}

/**
 * The daily counts of the period (the rollup). Days the rollup has not reached are absent.
 * @param db D1 database.
 * @param range The period, as days.
 * @returns One row per day, oldest first.
 */
export async function dailyMetrics(db: D1Database, range: ReportRange): Promise<MetricsDay[]> {
  const [result] = await db.batch([
    statement(
      db,
      `SELECT day, page_views, product_views, add_to_carts, checkouts_started, orders_placed, orders_paid, revenue_minor
       FROM daily_metrics WHERE day >= ? AND day <= ? ORDER BY day ASC`,
      [range.from, range.to],
    ),
  ]);
  return (
    (result?.results ?? []) as {
      day: string;
      page_views: number;
      product_views: number;
      add_to_carts: number;
      checkouts_started: number;
      orders_placed: number;
      orders_paid: number;
      revenue_minor: number;
    }[]
  ).map((row) => ({
    day: row.day,
    pageViews: row.page_views,
    productViews: row.product_views,
    addToCarts: row.add_to_carts,
    checkoutsStarted: row.checkouts_started,
    ordersPlaced: row.orders_placed,
    ordersPaid: row.orders_paid,
    revenueMinor: row.revenue_minor,
  }));
}

/**
 * Notifications by channel and template, for messages created in the period. Each column counts the messages that reached
 * that state or a later one: a read message is also delivered and sent.
 * @param db D1 database.
 * @param range The period.
 * @returns One row per channel and template.
 */
export async function notificationCounts(db: D1Database, range: ReportRange): Promise<NotificationRow[]> {
  const [result] = await db.batch([
    statement(
      db,
      `SELECT channel, template_key AS template,
              SUM(CASE WHEN status IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END) AS sent,
              SUM(CASE WHEN status IN ('delivered', 'read') THEN 1 ELSE 0 END) AS delivered,
              SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) AS read,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM notification_log WHERE created_at >= ? AND created_at < ?
       GROUP BY channel, template ORDER BY channel ASC, template ASC LIMIT 200`,
      [range.startIso, range.endIso],
    ),
  ]);
  return (
    (result?.results ?? []) as {
      channel: string;
      template: string;
      sent: number;
      delivered: number;
      read: number;
      failed: number;
    }[]
  ).map((row) => ({
    channel: row.channel,
    template: row.template,
    sent: row.sent,
    delivered: row.delivered,
    read: row.read,
    failed: row.failed,
  }));
}
