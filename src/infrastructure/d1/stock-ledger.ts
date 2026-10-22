// Stock changes always go through here. The stock update and its ledger row are built together, so a batch cannot change
// stock without also writing the movement that explains it. The ledger row comes back from the same batch (RETURNING), so
// the stock a change reports is the one that batch produced, whatever other requests do at the same time.
import type { StockChange } from '@/application/ports/inventory';
import type { StockReason } from '@/domain/inventory/stock';
import { statement, type SqlValue } from './d1-client';

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

/** Where the ledger statement of a change sits in its batch, and the delta it applied. */
export interface LedgerSlot {
  index: number;
  delta: number;
}

/** Row the ledger statement returns. */
interface LedgerReturn {
  variant_id: string;
  product_id: string;
  stock_after: number;
  threshold: number | null;
}

/**
 * Builds the two statements of one stock change: the stock update and the ledger row. They must run in one batch.
 * The ledger row reads the stock after the update, so `stock_after` is always the real value, and it returns that value.
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
     SELECT ?, v.id, v.product_id, ?, v.stock, ?, ?, ?, ?, ? FROM product_variants v WHERE v.id = ? AND ${guard.sql}
     RETURNING variant_id, product_id, stock_after,
       (SELECT low_stock_threshold FROM product_variants WHERE id = variant_id) AS threshold`,
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
 * Adds the statements of a stock change to a batch.
 * @param db D1 binding.
 * @param statements The batch being built; the change's two statements are appended.
 * @param change The change.
 * @returns The slot of the ledger statement, to pass to stockChangesFrom with the batch's results.
 */
export function addStockChange(
  db: D1Database,
  statements: D1PreparedStatement[],
  change: StockLedgerChange,
): LedgerSlot {
  statements.push(...stockLedgerStatements(db, change));
  return { index: statements.length - 1, delta: change.delta };
}

/**
 * Reads the changes a batch applied from the results of that batch. A change whose guard did not hold wrote no ledger row
 * and is left out. The threshold is the variant's own; null means the store default.
 * @param results Results of `db.batch`, in statement order.
 * @param slots Slots returned by addStockChange for the batch.
 * @returns One change per ledger row written.
 */
export function stockChangesFrom(results: D1Result[], slots: LedgerSlot[]): StockChange[] {
  return slots.flatMap(({ index, delta }) => {
    const row = (results[index]?.results as LedgerReturn[] | undefined)?.[0];
    if (!row) return [];
    return [
      {
        variantId: row.variant_id,
        productId: row.product_id,
        before: row.stock_after - delta,
        after: row.stock_after,
        threshold: row.threshold,
      },
    ];
  });
}
