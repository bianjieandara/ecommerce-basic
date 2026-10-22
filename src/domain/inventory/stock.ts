// Stock movement reasons and the threshold rules that decide when alerts fire.
// Every change to stock is recorded in the inventory ledger with one of these reasons.

/** Why stock changed. Matches the CHECK constraint on inventory_movements.reason. */
export const STOCK_REASONS = [
  'initial',
  'sale',
  'cancel_restore',
  'restock',
  'manual_adjust',
  'return',
  'damage',
  'import',
] as const;

/** One reason a stock changed. */
export type StockReason = (typeof STOCK_REASONS)[number];

/** The reasons an admin can pick for a manual change. The others come from the system. */
export const MANUAL_STOCK_REASONS = ['restock', 'manual_adjust', 'return', 'damage'] as const;

/** One reason the adjustment form offers. */
export type ManualStockReason = (typeof MANUAL_STOCK_REASONS)[number];

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

/** Stock states shown in the inventory table; the table's status filter uses the same values. */
export const STOCK_STATUSES = ['in_stock', 'low', 'out', 'untracked'] as const;

/** Stock state of one variant. */
export type StockStatus = (typeof STOCK_STATUSES)[number];

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

/** Why a requested change cannot apply. The screens translate these codes. */
export type StockProblem = 'untracked' | 'negative_count' | 'below_zero';

/** A requested change turned into a delta, or the reason it cannot apply. */
export type StockPlan = { delta: number } | { problem: StockProblem };

/**
 * Turns a requested change into the delta to apply. This is the one place that defines "set": a counted value becomes the
 * difference from the stock the admin was looking at (when the screen sent it), so a sale made meanwhile is kept.
 * @param request The variant's current state and what was asked: `add` units (negative removes), or `set` a counted value.
 * @returns The delta, or the problem that stops it.
 */
export function planStockChange(request: {
  tracked: boolean;
  stock: number;
  mode: 'add' | 'set';
  quantity: number;
  /** The stock the admin saw. Used by `set`; the stock on record is used when it is missing. */
  expected?: number;
}): StockPlan {
  if (!request.tracked) return { problem: 'untracked' };
  if (request.mode === 'set' && request.quantity < 0) return { problem: 'negative_count' };
  const delta =
    request.mode === 'set' ? request.quantity - (request.expected ?? request.stock) : request.quantity;
  if (request.stock + delta < 0) return { problem: 'below_zero' };
  return { delta };
}
