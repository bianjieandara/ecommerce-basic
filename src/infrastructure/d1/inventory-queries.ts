// D1 reads for the inventory screens, the scanner and the movement ledger. Writes live in stock-repository.ts.
import type {
  InventoryFilter,
  InventoryQueries,
  InventoryRow,
  InventoryTotals,
  MovementFilter,
  StockMovement,
} from '@/application/ports/inventory';
import { dayAfterStartUtc, dayStartUtc } from '@/domain/shared/day-bounds';
import type { Locale } from '@/domain/shared/locale';
import { toPaginated, type Paginated } from '@/domain/shared/pagination';
import { queryAll, queryFirst, statement, type SqlValue } from './d1-client';
import {
  INVENTORY_FROM,
  INVENTORY_ROW_SELECT,
  rowBinds,
  toInventoryRow,
  type InventoryRecord,
  type MovementRecord,
} from './inventory-rows';
import { PRODUCT_NAME_SQL, VARIANT_LABEL_SQL, textSearch, whereClause } from './sql-fragments';

/**
 * ORDER BY per sort, over the variant and product tables (the page's ids are found before any other column is computed).
 * Every sort ends with the variant id, so a page boundary never repeats or skips a row.
 */
const SORTS: Record<InventoryFilter['sort'], { sql: string; needsLocale: boolean }> = {
  name: { sql: `${PRODUCT_NAME_SQL} COLLATE NOCASE, v.product_id, v.position, v.id`, needsLocale: true },
  stock_asc: { sql: 'v.stock, v.product_id, v.position, v.id', needsLocale: false },
  stock_desc: { sql: 'v.stock DESC, v.product_id, v.position, v.id', needsLocale: false },
  value_desc: {
    sql: 'v.stock * COALESCE(v.price_minor, p.base_price_minor) DESC, v.product_id, v.position, v.id',
    needsLocale: false,
  },
};

/** D1-backed inventory reads. */
export class D1InventoryQueries implements InventoryQueries {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  /**
   * Matches a SKU or a barcode exactly. A code that is both one variant's SKU and another's barcode opens the SKU's variant.
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
      `${INVENTORY_ROW_SELECT} WHERE v.sku = ? OR v.barcode = ? ORDER BY (v.sku = ?) DESC, v.id LIMIT 1`,
      [...rowBinds(defaultThreshold, locale), code, code, code],
    );
    return row ? toInventoryRow(row) : null;
  }

  /**
   * One page of the inventory table. The page's ids and the total come first, from the variant and product tables only; the
   * names, labels and thumbnails are then loaded for those rows alone, not for every row that matches.
   * @param filter Filters, sort and page.
   * @returns The rows and the paging information.
   */
  async listRows(filter: InventoryFilter): Promise<Paginated<InventoryRow>> {
    const { clause, binds } = inventoryWhere(filter);
    const sort = SORTS[filter.sort];
    const [counted, paged] = await this.db.batch([
      statement(this.db, `SELECT COUNT(*) AS n ${INVENTORY_FROM} ${clause}`, binds),
      statement(this.db, `SELECT v.id ${INVENTORY_FROM} ${clause} ORDER BY ${sort.sql} LIMIT ? OFFSET ?`, [
        ...binds,
        ...(sort.needsLocale ? [filter.locale] : []),
        filter.pageSize,
        (filter.page - 1) * filter.pageSize,
      ]),
    ]);
    const total = (counted?.results[0] as { n: number } | undefined)?.n ?? 0;
    const ids = ((paged?.results ?? []) as { id: string }[]).map((row) => row.id);
    if (ids.length === 0) {
      return toPaginated([], total, { page: filter.page, pageSize: filter.pageSize });
    }
    const records = await queryAll<InventoryRecord>(
      this.db,
      `${INVENTORY_ROW_SELECT} WHERE v.id IN (SELECT value FROM json_each(?))`,
      [...rowBinds(filter.defaultThreshold, filter.locale), JSON.stringify(ids)],
    );
    const byId = new Map(records.map((record) => [record.variant_id, record]));
    const items = ids.flatMap((id) => {
      const record = byId.get(id);
      return record ? [toInventoryRow(record)] : [];
    });
    return toPaginated(items, total, { page: filter.page, pageSize: filter.pageSize });
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
       ${INVENTORY_FROM}
       WHERE v.track_inventory = 1`,
    );
    return { units: row?.units ?? 0, costMinor: row?.cost_minor ?? 0, retailMinor: row?.retail_minor ?? 0 };
  }

  /**
   * One page of the movement ledger, newest first. The page's ids come first, then the names for those rows alone.
   * @param filter Filters and page.
   * @returns The rows and the paging information.
   */
  async listMovements(filter: MovementFilter): Promise<Paginated<StockMovement>> {
    const { clause, binds } = movementWhere(filter);
    const from = `FROM inventory_movements m JOIN product_variants v ON v.id = m.variant_id
      JOIN products p ON p.id = v.product_id`;
    const [counted, paged] = await this.db.batch([
      statement(this.db, `SELECT COUNT(*) AS n ${from} ${clause}`, binds),
      statement(
        this.db,
        `SELECT m.id ${from} ${clause} ORDER BY m.created_at DESC, m.rowid DESC LIMIT ? OFFSET ?`,
        [...binds, filter.pageSize, (filter.page - 1) * filter.pageSize],
      ),
    ]);
    const total = (counted?.results[0] as { n: number } | undefined)?.n ?? 0;
    const ids = ((paged?.results ?? []) as { id: string }[]).map((row) => row.id);
    if (ids.length === 0) {
      return toPaginated([], total, { page: filter.page, pageSize: filter.pageSize });
    }
    const records = await queryAll<MovementRecord>(
      this.db,
      `SELECT m.id, m.variant_id, v.sku, m.delta, m.stock_after, m.reason, m.reference, m.note, m.created_at,
         ${PRODUCT_NAME_SQL} AS product_name, ${VARIANT_LABEL_SQL} AS variant_label,
         COALESCE((SELECT u.name FROM admin_users u WHERE u.id = m.actor), m.actor) AS actor_name
       ${from} WHERE m.id IN (SELECT value FROM json_each(?))`,
      [filter.locale, filter.locale, JSON.stringify(ids)],
    );
    const byId = new Map(records.map((record) => [record.id, record]));
    const items = ids.flatMap((id) => {
      const record = byId.get(id);
      return record ? [toMovement(record)] : [];
    });
    return toPaginated(items, total, { page: filter.page, pageSize: filter.pageSize });
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
    const search = textSearch(filter.search, ['v.sku', 'v.barcode']);
    conditions.push(search.sql);
    binds.push(...search.binds);
  }
  if (filter.categoryId) {
    conditions.push(
      'EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ?)',
    );
    binds.push(filter.categoryId);
  }
  if (filter.trackedOnly) conditions.push('v.track_inventory = 1');
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
    const search = textSearch(filter.search, ['v.sku', 'v.barcode']);
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
  // Days are the store's, so each end is the instant that day starts (or the next one does) in its time zone. Timestamps are
  // ISO UTC strings of one fixed length, so comparing them as text compares them in time, and the index on created_at works.
  if (filter.from) {
    conditions.push('m.created_at >= ?');
    binds.push(dayStartUtc(filter.from, filter.timeZone));
  }
  if (filter.to) {
    conditions.push('m.created_at < ?');
    binds.push(dayAfterStartUtc(filter.to, filter.timeZone));
  }
  return { clause: whereClause(conditions), binds };
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
