// Stock changes always go through here. The stock update and its ledger row are built together, so a batch cannot change
// stock without also writing the movement that explains it.
import type { StockChange } from '@/application/ports/inventory';
import type { StockReason } from '@/domain/inventory/stock';
import { queryAll, statement, type SqlValue } from './d1-client';

/** One stock change and the guard that must hold for it to apply. */
export interface StockLedgerChange {
  variantId: string;
  delta: number;
  reason: StockReason;
  reference: string | null;
  note: string | null;
  actor: string;
  nowIso: string;
  /** SQL condition with its parameters. The change and its ledger row apply only while it holds. */
  guard?: { sql: string; params: SqlValue[] };
}

/** Stock of a variant as the ledger holds it, with its own alert threshold (null = store default). */
export interface StockLevel {
  productId: string;
  stock: number;
  threshold: number | null;
}

/**
 * Builds the two statements of one stock change: the stock update and the ledger row. They must run in one batch.
 * The ledger row reads the stock after the update, so `stock_after` is always the real value.
 * @param db D1 binding.
 * @param change The change.
 * @returns The update first, then the ledger row.
 */
export function stockLedgerStatements(db: D1Database, change: StockLedgerChange): D1PreparedStatement[] {
  const guard = change.guard ?? { sql: '1 = 1', params: [] };
  const update = statement(
    db,
    `UPDATE product_variants SET stock = stock + ? WHERE id = ? AND ${guard.sql}`,
    [change.delta, change.variantId, ...guard.params],
  );
  const ledger = statement(
    db,
    `INSERT INTO inventory_movements (id, variant_id, product_id, delta, stock_after, reason, reference, note, actor, created_at)
     SELECT ?, v.id, v.product_id, ?, v.stock, ?, ?, ?, ?, ? FROM product_variants v WHERE v.id = ? AND ${guard.sql}`,
    [
      crypto.randomUUID(),
      change.delta,
      change.reason,
      change.reference,
      change.note,
      change.actor,
      change.nowIso,
      change.variantId,
      ...guard.params,
    ],
  );
  return [update, ledger];
}

/**
 * Reads the stock of variants as it is now. Call it after the batch that changed them, so the values include that batch.
 * @param db D1 binding.
 * @param variantIds Variants to read; unknown ids are missing from the result.
 * @returns The stock per variant id.
 */
export async function readStockLevels(
  db: D1Database,
  variantIds: string[],
): Promise<Map<string, StockLevel>> {
  if (variantIds.length === 0) return new Map();
  const rows = await queryAll<{
    id: string;
    product_id: string;
    stock: number;
    low_stock_threshold: number | null;
  }>(
    db,
    'SELECT id, product_id, stock, low_stock_threshold FROM product_variants WHERE id IN (SELECT value FROM json_each(?))',
    [JSON.stringify(variantIds)],
  );
  return new Map(
    rows.map((row): [string, StockLevel] => [
      row.id,
      { productId: row.product_id, stock: row.stock, threshold: row.low_stock_threshold },
    ]),
  );
}

/**
 * Turns applied deltas into stock changes. `after` is the stock on record now; `before` is `after` minus the delta.
 * A delta for a variant that is missing from `levels` is skipped.
 * @param levels Stock read after the batch.
 * @param deltas The deltas that were applied.
 * @returns One change per delta that has a stock level.
 */
export function changesAfter(
  levels: Map<string, StockLevel>,
  deltas: { variantId: string; delta: number }[],
): StockChange[] {
  return deltas.flatMap(({ variantId, delta }) => {
    const level = levels.get(variantId);
    if (!level) return [];
    return [
      {
        variantId,
        productId: level.productId,
        before: level.stock - delta,
        after: level.stock,
        threshold: level.threshold,
      },
    ];
  });
}
