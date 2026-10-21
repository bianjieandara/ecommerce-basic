// Tax maths for prices that include tax (IVA/VAT inside the price) or exclude it (tax added at checkout).
// Rates are basis points (1900 = 19%). All arithmetic is integer, rounding half up.
import { DomainError } from '../shared/errors';

/** Net, tax and gross split of one amount. */
export interface LineTax {
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
}

/** Tax total for one rate: taxable base and the tax it produced. */
export interface TaxBreakdownRow {
  rateBp: number;
  baseMinor: number;
  taxMinor: number;
}

/**
 * Integer division rounded half up, for non-negative numbers.
 * @param numerator Dividend.
 * @param denominator Divisor (positive).
 * @returns Rounded quotient.
 */
function divideRoundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((numerator * 2 + denominator) / (denominator * 2));
}

/**
 * Splits an amount into net, tax and gross.
 * Included: the amount already contains the tax, so tax = amount × rate / (10000 + rate).
 * Excluded: the amount is net, so tax = amount × rate / 10000 and gross = amount + tax.
 * Integer maths stays exact up to about 10^12 minor units (far above any single order).
 * @param amountMinor Amount in minor units, as displayed when prices include tax or not.
 * @param rateBp Tax rate in basis points.
 * @param pricesIncludeTax Whether `amountMinor` already includes tax.
 * @returns The split.
 * @throws DomainError VALIDATION_FAILED for negative or non-integer input.
 */
export function computeLineTax(amountMinor: number, rateBp: number, pricesIncludeTax: boolean): LineTax {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new DomainError('VALIDATION_FAILED', `Invalid tax base: ${amountMinor}`);
  }
  if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > 10_000) {
    throw new DomainError('VALIDATION_FAILED', `Invalid tax rate: ${rateBp}`);
  }
  if (rateBp === 0) return { netMinor: amountMinor, taxMinor: 0, grossMinor: amountMinor };

  if (pricesIncludeTax) {
    const taxMinor = divideRoundHalfUp(amountMinor * rateBp, 10_000 + rateBp);
    return { netMinor: amountMinor - taxMinor, taxMinor, grossMinor: amountMinor };
  }
  const taxMinor = divideRoundHalfUp(amountMinor * rateBp, 10_000);
  return { netMinor: amountMinor, taxMinor, grossMinor: amountMinor + taxMinor };
}

/**
 * Groups net amounts and tax by rate, sorted by rate, for invoices and tax reports.
 * @param lines Per-line net and tax values with their rate.
 * @returns One row per distinct rate.
 */
export function summarizeTaxes(
  lines: { rateBp: number; netMinor: number; taxMinor: number }[],
): TaxBreakdownRow[] {
  const byRate = new Map<number, TaxBreakdownRow>();
  for (const line of lines) {
    const row = byRate.get(line.rateBp) ?? { rateBp: line.rateBp, baseMinor: 0, taxMinor: 0 };
    row.baseMinor += line.netMinor;
    row.taxMinor += line.taxMinor;
    byRate.set(line.rateBp, row);
  }
  return [...byRate.values()].sort((a, b) => a.rateBp - b.rateBp);
}

/**
 * Resolves the tax rate for a product: its own override when set, otherwise the store default.
 * An override of 0 means "exempt" and is kept.
 * @param productRateBp Product override in basis points, or null for the store default.
 * @param defaultRateBp Store default rate.
 * @returns The rate to apply.
 */
export function resolveRateBp(productRateBp: number | null, defaultRateBp: number): number {
  return productRateBp ?? defaultRateBp;
}
