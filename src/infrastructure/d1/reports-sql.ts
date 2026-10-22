// SQL the report reads share: what counts as a sale, the store-local day of a timestamp, the translated category name, and the
// condition of a period. Every report reads these from here, so two reports cannot disagree about a sale.
import { PAID_OR_LATER } from '@/domain/ordering/order-status';
import type { ReportRange } from '@/application/reports/ports';
import type { SqlValue } from './d1-client';

/** Placeholders and binds for the statuses that count as paid (revenue, invoices and the sales lists). */
export function paidStatuses(): { sql: string; binds: SqlValue[] } {
  return { sql: `(${PAID_OR_LATER.map(() => '?').join(', ')})`, binds: [...PAID_OR_LATER] };
}

/**
 * The store-local day of a timestamp column, as YYYY-MM-DD. The offset is written into the SQL as a number (it comes from
 * Intl, never from a request), so the grouping needs no bind.
 *
 * DST caveat: the offset is the one at the start of the range. A range that crosses a daylight-saving change groups the days
 * after the change with the old offset, so orders in the last hour of a day can land on the next day. The periods themselves
 * (the instants) are exact; only the grouping of that hour is off. Stores in zones without DST (Colombia, Peru, Mexico since
 * 2022) are not affected.
 * @param column Timestamp column, qualified with its alias (for example `o.paid_at`).
 * @param offsetMinutes Minutes the store's clock is ahead of UTC at the range start (negative behind UTC).
 * @returns The SQL expression.
 */
export function localDayExpr(column: string, offsetMinutes: number): string {
  if (!Number.isInteger(offsetMinutes)) throw new Error(`Offset must be whole minutes, got ${offsetMinutes}`);
  const sign = offsetMinutes < 0 ? '-' : '+';
  return `strftime('%Y-%m-%d', ${column}, '${sign}${Math.abs(offsetMinutes)} minutes')`;
}

/**
 * The paid orders of a period, by payment time. The alias is the orders table's alias in the query.
 * @param range The period.
 * @param alias Alias of the orders table.
 * @returns The condition, its binds in placeholder order.
 */
export function paidInRange(range: ReportRange, alias = 'o'): { sql: string; binds: SqlValue[] } {
  const statuses = paidStatuses();
  return {
    sql: `${alias}.status IN ${statuses.sql} AND ${alias}.paid_at >= ? AND ${alias}.paid_at < ?`,
    binds: [...statuses.binds, range.startIso, range.endIso],
  };
}

/**
 * The category name in the requested language, or another language when that one is missing. Takes the locale as a bind.
 * Expects the category as alias `c`.
 */
export const CATEGORY_NAME_SQL = `(SELECT t.name FROM category_translations t WHERE t.category_id = c.id ORDER BY (t.locale = ?) DESC LIMIT 1)`;
