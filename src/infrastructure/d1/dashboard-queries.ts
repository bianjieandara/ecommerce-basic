// Dashboard reads: every number of the admin home comes from one batch of independent queries, so the page costs one round trip
// to D1 however many cards it has. Days are the store's local days; the database keeps instants.
import type {
  DashboardDay,
  DashboardInput,
  DashboardQueries,
  DashboardSnapshot,
  PeriodKpis,
  TopProduct,
} from '@/application/ports/dashboard';
import { PAID_OR_LATER, type OrderStatus } from '@/domain/ordering/order-status';
import { dayStartUtc } from '@/domain/shared/day-bounds';
import { statement, type SqlValue } from './d1-client';
import { addDays, daysBefore, localDay, offsetMinutes } from './dashboard-days';

/** Statuses the store still has to work on: paid, not yet shipped. */
const TO_PROCESS: readonly OrderStatus[] = ['paid', 'processing'];

/** Days in the chart, ending today. */
const CHART_DAYS = 14;

/** Products in the top list. */
const TOP_PRODUCTS = 5;

/**
 * Placeholders and binds for a list of statuses, for an IN (...) condition.
 * @param statuses Statuses to match.
 * @returns The placeholders and the values to bind.
 */
function inList(statuses: readonly OrderStatus[]): { sql: string; binds: SqlValue[] } {
  return { sql: `(${statuses.map(() => '?').join(', ')})`, binds: [...statuses] };
}

/**
 * Builds the card numbers of one period. The average is rounded to whole minor units.
 * @param placed Orders placed in the period.
 * @param paid Orders paid in the period.
 * @param revenue Revenue of those orders, in minor units.
 * @param tax Tax of those orders, in minor units.
 * @returns The card numbers.
 */
function periodKpis(placed: number, paid: number, revenue: number, tax: number): PeriodKpis {
  return {
    placed,
    paidOrders: paid,
    revenueMinor: revenue,
    taxMinor: tax,
    averageOrderMinor: paid > 0 ? Math.round(revenue / paid) : 0,
  };
}

/**
 * Rows of one statement in a batch, read by its position. A missing statement gives no rows.
 * @param results Results of the batch.
 * @param index Position of the statement.
 * @returns The rows.
 */
function rowsAt<T>(results: { results: unknown[] }[], index: number): T[] {
  return (results[index]?.results ?? []) as T[];
}

/** D1-backed dashboard reads. */
export class D1DashboardQueries implements DashboardQueries {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async snapshot(input: DashboardInput): Promise<DashboardSnapshot> {
    const { nowIso, timeZone } = input;
    const today = localDay(nowIso, timeZone);
    const periodStarts = [
      dayStartUtc(today, timeZone),
      daysBefore(nowIso, 7),
      daysBefore(nowIso, 30),
    ] as const;
    const [, last7Start, last30Start] = periodStarts;
    const paid = inList(PAID_OR_LATER);
    const toProcess = inList(TO_PROCESS);
    const chartStart = dayStartUtc(addDays(today, -(CHART_DAYS - 1)), timeZone);
    const offset = `${offsetMinutes(nowIso, timeZone)} minutes`;

    const results = await this.db.batch([
      // Orders placed, per period: statements 0 to 2.
      ...periodStarts.map((start) =>
        statement(this.db, 'SELECT COUNT(*) AS n FROM orders WHERE created_at >= ? AND created_at <= ?', [
          start,
          nowIso,
        ]),
      ),
      // Orders paid and not refunded or cancelled, per period: statements 3 to 5.
      ...periodStarts.map((start) =>
        statement(
          this.db,
          `SELECT COUNT(*) AS n, COALESCE(SUM(total_minor), 0) AS revenue, COALESCE(SUM(tax_minor), 0) AS tax
           FROM orders WHERE status IN ${paid.sql} AND paid_at >= ? AND paid_at <= ?`,
          [...paid.binds, start, nowIso],
        ),
      ),
      statement(
        this.db,
        `SELECT COUNT(*) AS n FROM orders WHERE status IN ${toProcess.sql}`,
        toProcess.binds,
      ),
      statement(
        this.db,
        `SELECT COALESCE(SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END), 0) AS out_n,
                COALESCE(SUM(CASE WHEN stock > 0 AND stock <= COALESCE(low_stock_threshold, ?) THEN 1 ELSE 0 END), 0) AS low_n
         FROM product_variants WHERE track_inventory = 1 AND is_active = 1`,
        [input.defaultLowStockThreshold],
      ),
      statement(this.db, 'SELECT COUNT(*) AS n FROM contact_messages WHERE is_read = 0'),
      statement(
        this.db,
        `SELECT COUNT(*) AS n FROM notification_log WHERE status = 'failed' AND created_at >= ?`,
        [last7Start],
      ),
      statement(this.db, 'SELECT COUNT(*) AS n FROM failed_jobs WHERE resolved_at IS NULL'),
      statement(
        this.db,
        `SELECT oi.product_id AS product_id, MAX(oi.product_name) AS name, SUM(oi.quantity) AS units,
                SUM(oi.line_total_minor) AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.status IN ${paid.sql} AND o.paid_at >= ? AND o.paid_at <= ?
         GROUP BY oi.product_id ORDER BY units DESC, oi.product_id ASC LIMIT ?`,
        [...paid.binds, last30Start, nowIso, TOP_PRODUCTS],
      ),
      statement(
        this.db,
        `SELECT strftime('%Y-%m-%d', paid_at, ?) AS day, COUNT(*) AS orders, SUM(total_minor) AS revenue
         FROM orders WHERE status IN ${paid.sql} AND paid_at >= ? AND paid_at <= ?
         GROUP BY day ORDER BY day ASC`,
        [offset, ...paid.binds, chartStart, nowIso],
      ),
    ]);

    const placed = (index: number) => rowsAt<{ n: number }>(results, index)[0]?.n ?? 0;
    const paidRow = (index: number) =>
      rowsAt<{ n: number; revenue: number; tax: number }>(results, index)[0] ?? { n: 0, revenue: 0, tax: 0 };
    const kpisAt = (period: number): PeriodKpis => {
      const row = paidRow(3 + period);
      return periodKpis(placed(period), row.n, row.revenue, row.tax);
    };
    const stock = rowsAt<{ out_n: number; low_n: number }>(results, 7)[0];
    const chartRows = new Map(
      rowsAt<{ day: string; orders: number; revenue: number }>(results, 12).map((row) => [row.day, row]),
    );
    const chart: DashboardDay[] = Array.from({ length: CHART_DAYS }, (_, index) => {
      const day = addDays(today, index - (CHART_DAYS - 1));
      const row = chartRows.get(day);
      return { day, orders: row?.orders ?? 0, revenueMinor: row?.revenue ?? 0 };
    });
    const topProducts: TopProduct[] = rowsAt<{
      product_id: string;
      name: string;
      units: number;
      revenue: number;
    }>(results, 11).map((row) => ({
      productId: row.product_id,
      name: row.name,
      units: row.units,
      revenueMinor: row.revenue,
    }));

    return {
      currency: input.currency,
      today: kpisAt(0),
      last7Days: kpisAt(1),
      last30Days: kpisAt(2),
      ordersToProcess: rowsAt<{ n: number }>(results, 6)[0]?.n ?? 0,
      outOfStock: stock?.out_n ?? 0,
      lowStock: stock?.low_n ?? 0,
      unreadMessages: rowsAt<{ n: number }>(results, 8)[0]?.n ?? 0,
      failedNotifications: rowsAt<{ n: number }>(results, 9)[0]?.n ?? 0,
      unresolvedJobs: rowsAt<{ n: number }>(results, 10)[0]?.n ?? 0,
      topProducts,
      chart,
    };
  }
}
