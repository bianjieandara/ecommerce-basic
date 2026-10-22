// Stock movement reasons and the threshold rules that decide when alerts fire.
// Every change to stock is recorded in the inventory ledger with one of these reasons.

/** Why stock changed. Matches the CHECK constraint on inventory_movements.reason. */
export type StockReason =
  'initial' | 'sale' | 'cancel_restore' | 'restock' | 'manual_adjust' | 'return' | 'damage' | 'import';

/**
 * True when stock went from above the threshold to at or below it. Fires once per crossing, so a low-stock alert
 * is not repeated for every sale while stock stays low.
 * @param before Stock before the change.
 * @param after Stock after the change.
 * @param threshold Low-stock threshold for the variant.
 * @returns Whether the alert should fire.
 */
export function crossedLowStock(before: number, after: number, threshold: number): boolean {
  return before > threshold && after <= threshold;
}

/**
 * True when a variant went from empty to available. Used to notify "back in stock" subscribers.
 * @param before Stock before the change.
 * @param after Stock after the change.
 * @returns Whether subscribers should be notified.
 */
export function cameBackInStock(before: number, after: number): boolean {
  return before <= 0 && after > 0;
}

/** Stock state shown in the inventory table; the table's status filter uses the same values. */
export type StockStatus = 'in_stock' | 'low' | 'out' | 'untracked';

/** Most variants one adjustment can change. Bulk selection stops here, and the adjust endpoint refuses more. */
export const MAX_ADJUST_ITEMS = 50;

/**
 * Classifies a variant for the inventory table and its filters. Untracked variants are always sellable, so they never
 * show as low or out.
 * @param stock Units in stock.
 * @param threshold Low-stock threshold of the variant.
 * @param tracked Whether the variant tracks its stock.
 * @returns The status.
 */
export function stockStatus(stock: number, threshold: number, tracked: boolean): StockStatus {
  if (!tracked) return 'untracked';
  if (stock <= 0) return 'out';
  if (stock <= threshold) return 'low';
  return 'in_stock';
}
