// Inventory reads: the valuation as of now, the out-of-stock and low-stock lists, the slow movers, and the movements of the period.
// The stock lists use the current catalog, because they describe the shelf as it is now.
import type {
  InventoryData,
  MovementRow,
  ReportFilters,
  ReportRange,
  StockItem,
} from '@/application/reports/ports';
import { statement, type SqlValue } from './d1-client';
import { INVENTORY_FROM } from './inventory-rows';
import { paidStatuses } from './reports-sql';
import { PRODUCT_NAME_SQL, VARIANT_LABEL_SQL } from './sql-fragments';

/** Stock items listed per list (the counts are always complete). */
const STOCK_LIST = 50;

/** Row of a stock list. */
interface StockDbRow {
  variant_id: string;
  name: string | null;
  label: string | null;
  sku: string | null;
  stock: number;
  threshold: number;
  cost_minor: number | null;
}

/**
 * Turns a stock list row into the port's shape.
 * @param row Database row.
 * @returns The stock item.
 */
function toStockItem(row: StockDbRow): StockItem {
  return {
    variantId: row.variant_id,
    name: row.name ?? '',
    variantLabel: row.label ?? '',
    sku: row.sku,
    stock: row.stock,
    threshold: row.threshold,
    costMinor: row.cost_minor,
  };
}

/**
 * Inventory: what the shelf is worth now (at cost and at the selling price), the out-of-stock and low-stock lists, the slow
 * movers (stock that has not sold since the filter's instant) and the movements of the period by reason.
 * The threshold is inlined: it is a whole number from validated settings, and the variants' own thresholds need it twice.
 * @param db D1 database.
 * @param range The period (for the movements).
 * @param filters Locale, the default threshold and the slow-mover instant.
 * @returns The inventory data.
 */
export async function inventoryReport(
  db: D1Database,
  range: ReportRange,
  filters: ReportFilters,
): Promise<InventoryData> {
  const threshold = filters.defaultLowStockThreshold;
  if (!Number.isSafeInteger(threshold) || threshold < 0)
    throw new Error('Low-stock threshold must be a whole number');
  const locale = filters.locale;
  const tracked = 'v.track_inventory = 1';
  const lowWhere = `${tracked} AND v.stock > 0 AND v.stock <= COALESCE(v.low_stock_threshold, ${threshold})`;
  const outWhere = `${tracked} AND v.stock <= 0`;
  const sold = paidStatuses();
  const itemSelect = `SELECT v.id AS variant_id, ${PRODUCT_NAME_SQL} AS name, ${VARIANT_LABEL_SQL} AS label,
                             v.sku AS sku, v.stock AS stock, COALESCE(v.low_stock_threshold, ${threshold}) AS threshold,
                             v.cost_minor AS cost_minor`;
  const itemBinds: SqlValue[] = [locale, locale];
  const slowWhere = `${tracked} AND v.stock > 0 AND v.id NOT IN (
      SELECT oi.variant_id FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status IN ${sold.sql} AND o.paid_at >= ?)`;
  const slowBinds: SqlValue[] = [...sold.binds, filters.slowMoverSinceIso];
  const results = await db.batch([
    statement(
      db,
      `SELECT COUNT(*) AS variants, COALESCE(SUM(v.stock), 0) AS units,
              COALESCE(SUM(v.stock * COALESCE(v.cost_minor, 0)), 0) AS cost,
              COALESCE(SUM(v.stock * COALESCE(v.price_minor, p.base_price_minor)), 0) AS retail
       ${INVENTORY_FROM} WHERE ${tracked}`,
    ),
    statement(db, `SELECT COUNT(*) AS n ${INVENTORY_FROM} WHERE ${outWhere}`),
    statement(
      db,
      `${itemSelect} ${INVENTORY_FROM} WHERE ${outWhere} ORDER BY v.stock ASC, v.id ASC LIMIT ${STOCK_LIST}`,
      itemBinds,
    ),
    statement(db, `SELECT COUNT(*) AS n ${INVENTORY_FROM} WHERE ${lowWhere}`),
    statement(
      db,
      `${itemSelect} ${INVENTORY_FROM} WHERE ${lowWhere} ORDER BY v.stock ASC, v.id ASC LIMIT ${STOCK_LIST}`,
      itemBinds,
    ),
    statement(
      db,
      `SELECT COUNT(*) AS n, COALESCE(SUM(v.stock * COALESCE(v.cost_minor, 0)), 0) AS cost ${INVENTORY_FROM} WHERE ${slowWhere}`,
      slowBinds,
    ),
    statement(
      db,
      `${itemSelect} ${INVENTORY_FROM} WHERE ${slowWhere}
       ORDER BY (v.stock * COALESCE(v.cost_minor, 0)) DESC, v.id ASC LIMIT ${STOCK_LIST}`,
      [...itemBinds, ...slowBinds],
    ),
    statement(
      db,
      `SELECT m.reason AS reason, COUNT(*) AS movements,
              COALESCE(SUM(CASE WHEN m.delta > 0 THEN m.delta ELSE 0 END), 0) AS units_in,
              COALESCE(SUM(CASE WHEN m.delta < 0 THEN -m.delta ELSE 0 END), 0) AS units_out
       FROM inventory_movements m WHERE m.created_at >= ? AND m.created_at < ?
       GROUP BY m.reason ORDER BY movements DESC, m.reason ASC`,
      [range.startIso, range.endIso],
    ),
  ]);
  const at = (index: number) => ((results[index]?.results ?? []) as Record<string, number | null>[])[0] ?? {};
  const totals = at(0);
  const itemsAt = (index: number) => ((results[index]?.results ?? []) as StockDbRow[]).map(toStockItem);
  const movements = (
    (results[7]?.results ?? []) as {
      reason: string;
      movements: number;
      units_in: number;
      units_out: number;
    }[]
  ).map((row): MovementRow => ({
    reason: row.reason,
    movements: row.movements,
    unitsIn: row.units_in,
    unitsOut: row.units_out,
  }));
  return {
    variants: Number(totals.variants ?? 0),
    units: Number(totals.units ?? 0),
    costMinor: Number(totals.cost ?? 0),
    retailMinor: Number(totals.retail ?? 0),
    outOfStockCount: Number(at(1).n ?? 0),
    outOfStock: itemsAt(2),
    lowStockCount: Number(at(3).n ?? 0),
    lowStock: itemsAt(4),
    slowMoverCount: Number(at(5).n ?? 0),
    slowMoverCostMinor: Number(at(5).cost ?? 0),
    slowMovers: itemsAt(6),
    movements,
  };
}
