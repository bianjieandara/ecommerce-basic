// Cart quantity rules: a line never asks for more than the stock or the per-line maximum.

/** Largest quantity a customer can put on one cart line. */
export const MAX_LINE_QUANTITY = 20;

/** Result of clamping a requested quantity. */
export interface ClampedQuantity {
  quantity: number;
  /** True when the requested quantity had to be reduced. */
  adjusted: boolean;
}

/**
 * Limits a requested quantity to what is available and to the per-line maximum.
 * @param requested Quantity the customer asked for (at least 1).
 * @param available Units in stock, or null when the variant does not track inventory.
 * @param max Per-line maximum.
 * @returns The quantity to keep and whether it changed. A variant with no stock returns 0.
 */
export function clampQuantity(
  requested: number,
  available: number | null,
  max: number = MAX_LINE_QUANTITY,
): ClampedQuantity {
  const ceiling = available === null ? max : Math.min(max, Math.max(0, available));
  const quantity = Math.max(0, Math.min(requested, ceiling));
  return { quantity, adjusted: quantity !== requested };
}
