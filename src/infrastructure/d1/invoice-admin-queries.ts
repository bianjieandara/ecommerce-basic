// Admin invoice list: the page of invoices the filter matches, and the totals of the issued ones. Like the order list, the page's
// ids are found first and the rows are loaded for them only.
import type {
  AdminInvoiceFilter,
  AdminInvoiceQueries,
  AdminInvoiceRow,
  AdminInvoiceTotals,
} from '@/application/ports/invoice-admin';
import type { InvoiceStatus } from '@/domain/invoicing/invoice';
import type { CurrencyCode } from '@/domain/shared/currency';
import { queryAll, statement, type SqlValue } from './d1-client';
import { containsText, whereClause } from './sql-fragments';

/** Row of the list query. */
interface AdminInvoiceDbRow {
  id: string;
  series: string;
  number: number;
  order_number: number;
  status: InvoiceStatus;
  buyer_name: string;
  total_minor: number;
  tax_minor: number;
  currency: CurrencyCode;
  issued_at: string;
  void_reason: string | null;
}

/** Digits only: the search is an invoice or order number. */
const NUMBER_TEXT = /^\d{1,12}$/;

/**
 * Turns the filter into SQL conditions. The page, the count and the totals all use it, so they always agree.
 * @param filter Filter of the admin list.
 * @returns The conditions (joined with AND) and their binds.
 */
function conditionsFor(filter: AdminInvoiceFilter): { conditions: string[]; binds: SqlValue[] } {
  const conditions: string[] = [];
  const binds: SqlValue[] = [];
  if (filter.status) {
    conditions.push('i.status = ?');
    binds.push(filter.status);
  }
  if (filter.series) {
    conditions.push('i.series = ?');
    binds.push(filter.series);
  }
  if (filter.from) {
    conditions.push('i.issued_at >= ?');
    binds.push(filter.from);
  }
  if (filter.to) {
    conditions.push('i.issued_at < ?');
    binds.push(filter.to);
  }
  const text = filter.search?.trim() ?? '';
  if (text) {
    if (NUMBER_TEXT.test(text)) {
      conditions.push('(i.number = ? OR o.number = ?)');
      binds.push(Number(text), Number(text));
    } else {
      const name = containsText('o.customer_name', text);
      const email = containsText('o.customer_email', text);
      conditions.push(`(${name.sql} OR ${email.sql})`);
      binds.push(name.bind, email.bind);
    }
  }
  return { conditions, binds };
}

/**
 * Maps a row to the application shape.
 * @param row Database row.
 * @returns List row.
 */
function toRow(row: AdminInvoiceDbRow): AdminInvoiceRow {
  return {
    id: row.id,
    series: row.series,
    number: row.number,
    orderNumber: row.order_number,
    status: row.status,
    buyerName: row.buyer_name,
    totalMinor: row.total_minor,
    taxMinor: row.tax_minor,
    currency: row.currency,
    issuedAt: row.issued_at,
    voidReason: row.void_reason,
  };
}

/** D1-backed reads for the admin invoice list. */
export class D1InvoiceAdminQueries implements AdminInvoiceQueries {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async list(
    filter: AdminInvoiceFilter,
    page: number,
    pageSize: number,
  ): Promise<{ items: AdminInvoiceRow[]; total: number; totals: AdminInvoiceTotals }> {
    const { conditions, binds } = conditionsFor(filter);
    const from = 'FROM invoices i JOIN orders o ON o.id = i.order_id';
    // The page, the count and the totals are independent, so one batch answers all three.
    const results = await this.db.batch([
      statement(
        this.db,
        `SELECT i.id ${from} ${whereClause(conditions)} ORDER BY i.issued_at DESC, i.id DESC LIMIT ? OFFSET ?`,
        [...binds, pageSize, (page - 1) * pageSize],
      ),
      statement(this.db, `SELECT COUNT(*) AS n ${from} ${whereClause(conditions)}`, binds),
      statement(
        this.db,
        `SELECT COUNT(*) AS issued, COALESCE(SUM(i.total_minor), 0) AS total_minor, COALESCE(SUM(i.tax_minor), 0) AS tax_minor
         ${from} ${whereClause([...conditions, `i.status = 'issued'`])}`,
        binds,
      ),
    ]);
    const total = ((results[1]?.results ?? []) as { n: number }[])[0]?.n ?? 0;
    const sums = (
      (results[2]?.results ?? []) as { issued: number; total_minor: number; tax_minor: number }[]
    )[0];
    const ids = ((results[0]?.results ?? []) as { id: string }[]).map((row) => row.id);
    if (ids.length === 0) {
      return {
        items: [],
        total,
        totals: {
          issued: sums?.issued ?? 0,
          totalMinor: sums?.total_minor ?? 0,
          taxMinor: sums?.tax_minor ?? 0,
        },
      };
    }
    const rows = await queryAll<AdminInvoiceDbRow>(
      this.db,
      `SELECT i.id, i.series, i.number, o.number AS order_number, i.status, o.customer_name AS buyer_name,
              i.total_minor, i.tax_minor, i.currency, i.issued_at, i.void_reason
       ${from} WHERE i.id IN (SELECT value FROM json_each(?))`,
      [JSON.stringify(ids)],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toRow(row)] : [];
    });
    return {
      items,
      total,
      totals: {
        issued: sums?.issued ?? 0,
        totalMinor: sums?.total_minor ?? 0,
        taxMinor: sums?.tax_minor ?? 0,
      },
    };
  }
}
