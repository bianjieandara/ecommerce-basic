// D1 reads for the inventory screens, the scanner and the movement ledger. Writes live in stock-repository.ts.
import type {
  InventoryFilter,
  InventoryQueries,
  InventoryRow,
  InventoryTotals,
  MovementFilter,
  StockMovement,
} from '@/application/ports/inventory';
import type { Locale } from '@/domain/shared/locale';
import { toPaginated, type Paginated } from '@/domain/shared/pagination';
import { toPrefixQuery } from './catalog-query-service';
import { queryAll, queryFirst, type SqlValue } from './d1-client';
import {
  INVENTORY_ROW_SELECT,
  PRODUCT_NAME_SQL,
  VARIANT_LABEL_SQL,
  rowBinds,
  toInventoryRow,
  type InventoryRecord,
  type MovementRecord,
} from './inventory-rows';

/** ORDER BY per sort. Runs over the outer select, so the aliases of the row select are available. */
const SORTS: Record<InventoryFilter['sort'], string> = {
  name: 'r.product_name COLLATE NOCASE, r.variant_label, r.variant_id',
  stock_asc: 'r.stock, r.product_name COLLATE NOCASE',
  stock_desc: 'r.stock DESC, r.product_name COLLATE NOCASE',
  value_desc: 'r.stock * r.price_minor DESC',
};

/** D1-backed inventory reads. */
export class D1InventoryQueries implements InventoryQueries {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  /**
   * Matches a SKU or a barcode exactly.
   * @param code Typed or scanned code.
   * @param locale Language of the names.
   * @param defaultThreshold Store default low-stock threshold.
   * @returns The variant, or null.
   */
  async findVariantByCode(
    code: string,
    locale: Locale,
    defaultThreshold: number,
  ): Promise<InventoryRow | null> {
    const row = await queryFirst<InventoryRecord>(
      this.db,
      `${INVENTORY_ROW_SELECT} WHERE v.sku = ? OR v.barcode = ? LIMIT 1`,
      [...rowBinds(defaultThreshold, locale), code, code],
    );
    return row ? toInventoryRow(row) : null;
  }

  /**
   * One page of the inventory table.
   * @param filter Filters, sort and page.
   * @returns The rows and the paging information.
   */
  async listRows(filter: InventoryFilter): Promise<Paginated<InventoryRow>> {
    const { clause, binds } = inventoryWhere(filter);
    const counted = await queryFirst<{ n: number }>(
      this.db,
      `SELECT COUNT(*) AS n FROM product_variants v JOIN products p ON p.id = v.product_id ${clause}`,
      binds,
    );
    const rows = await queryAll<InventoryRecord>(
      this.db,
      `SELECT * FROM (${INVENTORY_ROW_SELECT} ${clause}) r ORDER BY ${SORTS[filter.sort]} LIMIT ? OFFSET ?`,
      [
        ...rowBinds(filter.defaultThreshold, filter.locale),
        ...binds,
        filter.pageSize,
        (filter.page - 1) * filter.pageSize,
      ],
    );
    return toPaginated(rows.map(toInventoryRow), counted?.n ?? 0, {
      page: filter.page,
      pageSize: filter.pageSize,
    });
  }

  /**
   * Totals of every tracked variant, at cost and at the selling price.
   * @returns Units on hand and their value.
   */
  async totals(): Promise<InventoryTotals> {
    const row = await queryFirst<{ units: number; cost_minor: number; retail_minor: number }>(
      this.db,
      `SELECT COALESCE(SUM(v.stock), 0) AS units,
         COALESCE(SUM(v.stock * COALESCE(v.cost_minor, 0)), 0) AS cost_minor,
         COALESCE(SUM(v.stock * COALESCE(v.price_minor, p.base_price_minor)), 0) AS retail_minor
       FROM product_variants v JOIN products p ON p.id = v.product_id
       WHERE v.track_inventory = 1`,
    );
    return { units: row?.units ?? 0, costMinor: row?.cost_minor ?? 0, retailMinor: row?.retail_minor ?? 0 };
  }

  /**
   * One page of the movement ledger, newest first.
   * @param filter Filters and page.
   * @returns The rows and the paging information.
   */
  async listMovements(filter: MovementFilter): Promise<Paginated<StockMovement>> {
    const { clause, binds } = movementWhere(filter);
    const from = `FROM inventory_movements m JOIN product_variants v ON v.id = m.variant_id
      JOIN products p ON p.id = v.product_id`;
    const counted = await queryFirst<{ n: number }>(this.db, `SELECT COUNT(*) AS n ${from} ${clause}`, binds);
    const rows = await queryAll<MovementRecord>(
      this.db,
      `SELECT m.id, m.variant_id, v.sku, m.delta, m.stock_after, m.reason, m.reference, m.note, m.created_at,
         ${PRODUCT_NAME_SQL} AS product_name, ${VARIANT_LABEL_SQL} AS variant_label,
         COALESCE((SELECT u.name FROM admin_users u WHERE u.id = m.actor), m.actor) AS actor_name
       ${from} ${clause}
       ORDER BY m.created_at DESC, m.rowid DESC LIMIT ? OFFSET ?`,
      [filter.locale, filter.locale, ...binds, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );
    return toPaginated(rows.map(toMovement), counted?.n ?? 0, {
      page: filter.page,
      pageSize: filter.pageSize,
    });
  }
}

/**
 * The WHERE clause of the inventory table. Binds follow the order of the placeholders in the clause.
 * @param filter Filters.
 * @returns The clause (empty when nothing is filtered) and its binds.
 */
function inventoryWhere(filter: InventoryFilter): { clause: string; binds: SqlValue[] } {
  const conditions: string[] = [];
  const binds: SqlValue[] = [];
  if (filter.search) {
    const search = searchSql(filter.search);
    conditions.push(search.sql);
    binds.push(...search.binds);
  }
  if (filter.categoryId) {
    conditions.push(
      'EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ?)',
    );
    binds.push(filter.categoryId);
  }
  // The same rules as stockStatus() in the domain: untracked, out (empty), low (at or below the threshold), in stock.
  switch (filter.status) {
    case 'all':
      break;
    case 'untracked':
      conditions.push('v.track_inventory = 0');
      break;
    case 'out':
      conditions.push('v.track_inventory = 1 AND v.stock <= 0');
      break;
    case 'low':
      conditions.push(
        'v.track_inventory = 1 AND v.stock > 0 AND v.stock <= COALESCE(v.low_stock_threshold, ?)',
      );
      binds.push(filter.defaultThreshold);
      break;
    case 'in_stock':
      conditions.push('v.track_inventory = 1 AND v.stock > COALESCE(v.low_stock_threshold, ?)');
      binds.push(filter.defaultThreshold);
      break;
  }
  return { clause: whereClause(conditions), binds };
}

/**
 * The WHERE clause of the movement ledger.
 * @param filter Filters.
 * @returns The clause and its binds.
 */
function movementWhere(filter: MovementFilter): { clause: string; binds: SqlValue[] } {
  const conditions: string[] = [];
  const binds: SqlValue[] = [];
  if (filter.search) {
    const search = searchSql(filter.search);
    conditions.push(search.sql);
    binds.push(...search.binds);
  }
  if (filter.variantId) {
    conditions.push('m.variant_id = ?');
    binds.push(filter.variantId);
  }
  if (filter.reason) {
    conditions.push('m.reason = ?');
    binds.push(filter.reason);
  }
  // Dates are compared by their day part, so both ends are included.
  if (filter.from) {
    conditions.push('substr(m.created_at, 1, 10) >= ?');
    binds.push(filter.from);
  }
  if (filter.to) {
    conditions.push('substr(m.created_at, 1, 10) <= ?');
    binds.push(filter.to);
  }
  return { clause: whereClause(conditions), binds };
}

/**
 * Text search over SKU, barcode and product name. The name uses the full-text index when the text has words to search.
 * @param text What the admin typed.
 * @returns The condition and its binds.
 */
function searchSql(text: string): { sql: string; binds: SqlValue[] } {
  const like = `%${text}%`;
  const parts = ['v.sku LIKE ?', 'v.barcode LIKE ?'];
  const binds: SqlValue[] = [like, like];
  const prefix = toPrefixQuery(text);
  if (prefix) {
    parts.push('p.id IN (SELECT product_id FROM product_search WHERE product_search MATCH ?)');
    binds.push(prefix);
  }
  return { sql: `(${parts.join(' OR ')})`, binds };
}

/**
 * Joins conditions into a WHERE clause.
 * @param conditions Conditions, combined with AND.
 * @returns The clause, or an empty string when there are no conditions.
 */
function whereClause(conditions: string[]): string {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

/**
 * Maps a ledger row to the port's shape.
 * @param row Row from the database.
 * @returns The movement.
 */
function toMovement(row: MovementRecord): StockMovement {
  return {
    id: row.id,
    variantId: row.variant_id,
    sku: row.sku,
    productName: row.product_name ?? '',
    variantLabel: row.variant_label ?? '',
    delta: row.delta,
    stockAfter: row.stock_after,
    reason: row.reason,
    reference: row.reference,
    note: row.note,
    actor: row.actor_name,
    createdAt: row.created_at,
  };
}
