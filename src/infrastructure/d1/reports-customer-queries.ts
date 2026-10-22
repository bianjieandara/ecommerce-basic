// Customer reports: unique buyers, new and returning ones, the top customers and where they ship to. A buyer is identified by
// the lower-cased e-mail address of their paid orders. The first paid order of each buyer is read over all time, so a buyer's
// "new" status does not depend on how far back the report looks.
import type { CustomerRow, CustomersData, ReportRange } from '@/application/reports/ports';
import { statement, type SqlValue } from './d1-client';
import { paidInRange, paidStatuses } from './reports-sql';

/** Customers in the top list. */
const TOP_CUSTOMERS = 10;
/** Countries and cities in their lists. */
const TOP_PLACES = 10;

/**
 * The buyers of the period and their first paid order, as a common table expression. Its binds come first in the statement.
 * @param range The period.
 * @returns The WITH clause (without the keyword), the binds, and the name of the buyers' CTE.
 */
function buyersCte(range: ReportRange): { sql: string; binds: SqlValue[] } {
  const statuses = paidStatuses();
  const paid = paidInRange(range, 'o');
  return {
    sql: `first_paid AS (
        SELECT LOWER(customer_email) AS email, MIN(paid_at) AS first_at
        FROM orders WHERE status IN ${statuses.sql} GROUP BY LOWER(customer_email)
      ),
      in_range AS (
        SELECT LOWER(o.customer_email) AS email, MAX(o.customer_name) AS name, COUNT(*) AS orders, SUM(o.total_minor) AS spent
        FROM orders o WHERE ${paid.sql} GROUP BY LOWER(o.customer_email)
      )`,
    binds: [...statuses.binds, ...paid.binds],
  };
}

/**
 * Customers over the period.
 * @param db D1 database.
 * @param range The period.
 * @returns Buyers, new buyers, the top customers, and the countries and cities of the paid orders.
 */
export async function customersReport(db: D1Database, range: ReportRange): Promise<CustomersData> {
  const cte = buyersCte(range);
  const paid = paidInRange(range, 'o');
  const address = `json_extract(o.shipping_address_json, '$.country')`;
  const results = await db.batch([
    statement(
      db,
      `WITH ${cte.sql}
       SELECT COUNT(*) AS buyers, SUM(CASE WHEN f.first_at >= ? THEN 1 ELSE 0 END) AS new_buyers
       FROM in_range i JOIN first_paid f ON f.email = i.email`,
      [...cte.binds, range.startIso],
    ),
    statement(
      db,
      `WITH ${cte.sql}
       SELECT i.email AS email, i.name AS name, i.orders AS orders, i.spent AS spent
       FROM in_range i ORDER BY i.spent DESC, i.email ASC LIMIT ${TOP_CUSTOMERS}`,
      cte.binds,
    ),
    statement(
      db,
      `SELECT ${address} AS country, COUNT(*) AS orders FROM orders o
       WHERE ${paid.sql} AND COALESCE(${address}, '') <> ''
       GROUP BY country ORDER BY orders DESC, country ASC LIMIT ${TOP_PLACES}`,
      paid.binds,
    ),
    statement(
      db,
      `SELECT ${address} AS country, json_extract(o.shipping_address_json, '$.city') AS city, COUNT(*) AS orders
       FROM orders o WHERE ${paid.sql} AND COALESCE(json_extract(o.shipping_address_json, '$.city'), '') <> ''
       GROUP BY city, country ORDER BY orders DESC, city ASC, country ASC LIMIT ${TOP_PLACES}`,
      paid.binds,
    ),
  ]);
  const totals = ((results[0]?.results ?? []) as { buyers: number; new_buyers: number | null }[])[0];
  return {
    buyers: totals?.buyers ?? 0,
    newBuyers: totals?.new_buyers ?? 0,
    top: (
      (results[1]?.results ?? []) as { email: string; name: string | null; orders: number; spent: number }[]
    ).map((row): CustomerRow => ({
      email: row.email,
      name: row.name ?? '',
      orders: row.orders,
      spentMinor: row.spent,
    })),
    countries: ((results[2]?.results ?? []) as { country: string; orders: number }[]).map((row) => ({
      country: row.country,
      orders: row.orders,
    })),
    cities: ((results[3]?.results ?? []) as { country: string | null; city: string; orders: number }[]).map(
      (row) => ({
        city: row.city,
        country: row.country ?? '',
        orders: row.orders,
      }),
    ),
  };
}
