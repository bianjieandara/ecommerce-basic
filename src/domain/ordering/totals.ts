// Order totals. The single function that computes what a customer sees and pays. Quotes, checkout,
// payment gateways and invoices all call it, so they can never disagree.
import { computeLineTax, summarizeTaxes, type LineTax, type TaxBreakdownRow } from './tax';

/** One cart line as priced: its displayed amount (gross or net, per settings) and its tax rate. */
export interface TotalsLine {
  amountMinor: number;
  taxRateBp: number;
}

/** Store tax settings that affect totals. */
export interface TaxSettings {
  pricesIncludeTax: boolean;
  defaultRateBp: number;
  taxShipping: boolean;
}

/** Shipping cost chosen by the customer, displayed the same way as prices. */
export interface ShippingQuote {
  amountMinor: number;
}

/** Full breakdown of an order. */
export interface OrderTotals {
  /** Sum of line amounts as displayed: gross when prices include tax, net otherwise. */
  subtotalMinor: number;
  /** Shipping amount as displayed. */
  shippingMinor: number;
  /** Total tax across lines and (when taxed) shipping. */
  taxMinor: number;
  /** Amount the customer pays. */
  totalMinor: number;
  /** Net, tax and gross per line, in the same order as the input lines. */
  lines: (LineTax & { rateBp: number })[];
  taxBreakdown: TaxBreakdownRow[];
}

/**
 * Computes subtotal, shipping, tax and grand total for an order.
 * Included prices: the total is the sum of displayed amounts (tax is already inside them).
 * Excluded prices: the tax is added on top of the net subtotal and shipping.
 * @param lines Priced cart lines.
 * @param shipping Shipping quote, or null for pickup or when no shipping applies.
 * @param tax Store tax settings.
 * @returns The totals.
 */
export function computeOrderTotals(
  lines: TotalsLine[],
  shipping: ShippingQuote | null,
  tax: TaxSettings,
): OrderTotals {
  const lineTaxes = lines.map((line) => ({
    rateBp: line.taxRateBp,
    ...computeLineTax(line.amountMinor, line.taxRateBp, tax.pricesIncludeTax),
  }));

  const shippingAmount = shipping?.amountMinor ?? 0;
  const shippingTax: LineTax = tax.taxShipping
    ? computeLineTax(shippingAmount, tax.defaultRateBp, tax.pricesIncludeTax)
    : { netMinor: shippingAmount, taxMinor: 0, grossMinor: shippingAmount };

  const displayed = (row: LineTax) => (tax.pricesIncludeTax ? row.grossMinor : row.netMinor);
  const subtotalMinor = lineTaxes.reduce((sum, row) => sum + displayed(row), 0);
  const shippingMinor = displayed(shippingTax);
  const taxMinor = lineTaxes.reduce((sum, row) => sum + row.taxMinor, 0) + shippingTax.taxMinor;
  const totalMinor = subtotalMinor + shippingMinor + (tax.pricesIncludeTax ? 0 : taxMinor);

  const taxedRows = tax.taxShipping
    ? [...lineTaxes, { rateBp: tax.defaultRateBp, ...shippingTax }]
    : lineTaxes;

  return {
    subtotalMinor,
    shippingMinor,
    taxMinor,
    totalMinor,
    lines: lineTaxes,
    taxBreakdown: summarizeTaxes(taxedRows),
  };
}
