// Stock changes always go through here. The stock update and its ledger row are built together, so a batch cannot change
// stock without also writing the movement that explains it.
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
