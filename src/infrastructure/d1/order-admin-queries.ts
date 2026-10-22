// Admin order list: the page of orders the filter matches. The page's ids are found first, and only those rows are loaded, so
// the list never joins what it does not show. The filter is built once and shared by the page and the count.
import type { AdminOrderFilter, AdminOrderQueries, AdminOrderRow } from '@/application/ports/order-admin';
import type { PaymentMethod } from '@/application/ports/payments';
import type { OrderStatus } from '@/domain/ordering/order-status';
import type { CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';
import { queryAll, statement, type SqlValue } from './d1-client';
import { escapeLike, whereClause } from './sql-fragments';

/** Row of the list query. */
interface AdminOrderDbRow {
  id: string;
  number: number;
  status: OrderStatus;
  payment_method: PaymentMethod;
  customer_name: string;
  customer_email: string;
  total_minor: number;
  currency: CurrencyCode;
  locale: Locale;
  created_at: string;
}

/** Digits only: the search is an order number. */
const NUMBER_TEXT = /^\d{1,12}$/;

/**
 * Turns the filter into SQL conditions. The page query and the count both use it, so they always agree.
 * @param filter Filter of the admin list.
 * @returns The conditions (joined with AND) and their binds.
 */
function conditionsFor(filter: AdminOrderFilter): { conditions: string[]; binds: SqlValue[] } {
  const conditions: string[] = [];
  const binds: SqlValue[] = [];
  if (filter.status) {
    conditions.push('o.status = ?');
    binds.push(filter.status);
  }
  if (filter.paymentMethod) {
    conditions.push('o.payment_method = ?');
    binds.push(filter.paymentMethod);
  }
  if (filter.from) {
    conditions.push('o.created_at >= ?');
    binds.push(filter.from);
  }
  if (filter.to) {
    conditions.push('o.created_at < ?');
    binds.push(filter.to);
  }
  const text = filter.search?.trim() ?? '';
  if (text) {
    // Typed text matches literally: escaping keeps "%" and "_" from acting as wildcards.
    const like = `%${escapeLike(text)}%`;
    if (NUMBER_TEXT.test(text)) {
      conditions.push(`(o.number = ? OR o.customer_phone LIKE ? ESCAPE '\\')`);
      binds.push(Number(text), like);
    } else {
      conditions.push(
        `(o.customer_name LIKE ? ESCAPE '\\' OR o.customer_email LIKE ? ESCAPE '\\' OR o.customer_phone LIKE ? ESCAPE '\\')`,
      );
      binds.push(like, like, like);
    }
  }
  return { conditions, binds };
}

/**
 * Maps a row to the application shape.
 * @param row Database row.
 * @returns List row.
 */
function toRow(row: AdminOrderDbRow): AdminOrderRow {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    paymentMethod: row.payment_method,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    totalMinor: row.total_minor,
    currency: row.currency,
    locale: row.locale,
    createdAt: row.created_at,
  };
}

/** D1-backed reads for the admin order list. */
export class D1OrderAdminQueries implements AdminOrderQueries {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async list(
    filter: AdminOrderFilter,
    page: number,
    pageSize: number,
  ): Promise<{ items: AdminOrderRow[]; total: number }> {
    const { conditions, binds } = conditionsFor(filter);
    const where = whereClause(conditions);
    // The page of ids and the total do not depend on each other, so one batch answers both.
    const results = await this.db.batch([
      statement(
        this.db,
        `SELECT o.id FROM orders o ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`,
        [...binds, pageSize, (page - 1) * pageSize],
      ),
      statement(this.db, `SELECT COUNT(*) AS n FROM orders o ${where}`, binds),
    ]);
    const total = ((results[1]?.results ?? []) as { n: number }[])[0]?.n ?? 0;
    const ids = ((results[0]?.results ?? []) as { id: string }[]).map((row) => row.id);
    if (ids.length === 0) return { items: [], total };
    const rows = await queryAll<AdminOrderDbRow>(
      this.db,
      `SELECT o.id, o.number, o.status, o.payment_method, o.customer_name, o.customer_email, o.total_minor,
              o.currency, o.locale, o.created_at
       FROM orders o WHERE o.id IN (SELECT value FROM json_each(?))`,
      [JSON.stringify(ids)],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    // The id query already sorted the page, so the rows are put back in that order.
    const items = ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toRow(row)] : [];
    });
    return { items, total };
  }
}
