// Shipping cost rules. Pickup is always free; a flat rate is waived when the subtotal reaches the threshold.

/** Kinds of shipping method. A pickup is collected by the customer, so it never charges. */
export const SHIPPING_KINDS = ['flat', 'pickup'] as const;

/** One kind of shipping method. */
export type ShippingKind = (typeof SHIPPING_KINDS)[number];

/** The parts of a shipping method that decide its price. */
export interface ShippingRule {
  kind: ShippingKind;
  priceMinor: number;
  freeOverMinor: number | null;
}

/**
 * Cost of a shipping method for a given subtotal.
 * @param rule Shipping method rule.
 * @param subtotalMinor Order subtotal as displayed, in minor units.
 * @returns Shipping cost in minor units (0 when free).
 */
export function shippingCostMinor(rule: ShippingRule, subtotalMinor: number): number {
  if (rule.kind === 'pickup') return 0;
  if (rule.freeOverMinor !== null && subtotalMinor >= rule.freeOverMinor) return 0;
  return rule.priceMinor;
}
