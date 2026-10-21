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
