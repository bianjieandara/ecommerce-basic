// QuoteCart: re-prices a cart on the server. The browser's copy of prices and stock is only a display hint;
// this use case is the only source of trusted prices and quantities.
import { z } from 'zod';
import { clampQuantity, MAX_LINE_QUANTITY } from '@/domain/ordering/cart-line';
import { computeOrderTotals, type OrderTotals } from '@/domain/ordering/totals';
import { resolveRateBp } from '@/domain/ordering/tax';
import { shippingCostMinor } from '@/domain/ordering/shipping';
import type { CatalogQueryService } from '../ports/catalog';
import type { ShippingMethodRepository } from '../ports/ordering';
import type { PaymentMethod } from '../ports/payments';
import type { TaxSettings } from '../dto/settings-dto';

/** Largest number of distinct lines a cart may send for quoting. */
export const MAX_CART_LINES = 50;

/** Input schema of the quote endpoint. Prices are optional snapshots used only to report changes. */
export const quoteCartInput = z.object({
  locale: z.enum(['es', 'en']),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
        unitPriceMinor: z.number().int().min(0).optional(),
      }),
    )
    .max(MAX_CART_LINES),
  /** Shipping method the customer picked. Its cost is added to the totals. The cart page omits it. */
  shippingMethodId: z.string().min(1).max(64).optional(),
});

/** One requested line, as parsed from the input. */
export type QuoteItem = z.infer<typeof quoteCartInput>['items'][number];

/** One line of the quote, ready for the cart UI and for order snapshots. */
export interface QuotedLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantLabel: string;
  sku: string | null;
  quantity: number;
  unitPriceMinor: number;
  compareAtPriceMinor: number | null;
  lineTotalMinor: number;
  taxRateBp: number;
  costMinor: number | null;
  stockTracked: boolean;
  available: boolean;
  flags: { unavailable: boolean; priceChanged: boolean; quantityAdjusted: boolean };
}

/** Full quote returned to the cart. */
export interface CartQuote {
  lines: QuotedLine[];
  totals: OrderTotals;
  shippingOptions: { id: string; name: string; costMinor: number; kind: 'flat' | 'pickup' }[];
  paymentMethods: PaymentMethod[];
}

/** Store settings the quote depends on. */
export interface QuoteSettings {
  tax: TaxSettings;
  /** Methods the customer may choose now: enabled, configured and able to charge in the store currency. */
  paymentMethods: PaymentMethod[];
}

/**
 * Prices, clamps and totals a cart against the catalog.
 * Unknown or inactive variants are flagged as unavailable and left out of the totals.
 */
export class QuoteCart {
  /**
   * @param deps Catalog read model and shipping methods.
   */
  constructor(
    private readonly deps: {
      catalog: CatalogQueryService;
      shipping: ShippingMethodRepository;
    },
  ) {}

  /**
   * Quotes a cart.
   * @param input Locale, requested lines and the chosen shipping method (optional).
   * @param settings Tax settings and the payment methods the customer may use.
   * @returns Lines, totals, shipping choices and enabled payment methods.
   */
  async execute(input: z.infer<typeof quoteCartInput>, settings: QuoteSettings): Promise<CartQuote> {
    const requested = new Map<string, QuoteItem>();
    for (const item of input.items) requested.set(item.variantId, item);

    const variants = await this.deps.catalog.getQuoteVariants([...requested.keys()], input.locale);
    const byId = new Map(variants.map((variant) => [variant.id, variant]));

    const lines: QuotedLine[] = [];
    for (const [variantId, item] of requested) {
      const variant = byId.get(variantId);
      if (!variant || !variant.isActive) {
        lines.push(unavailableLine(variantId, item));
        continue;
      }
      const available = variant.trackInventory ? variant.stock : null;
      const clamped = clampQuantity(item.quantity, available);
      const unavailable = clamped.quantity === 0;
      lines.push({
        variantId,
        productId: variant.productId,
        slug: '',
        name: variant.productName,
        variantLabel: variant.variantLabel,
        sku: variant.sku,
        quantity: clamped.quantity,
        unitPriceMinor: variant.priceMinor,
        compareAtPriceMinor: variant.compareAtPriceMinor,
        lineTotalMinor: variant.priceMinor * clamped.quantity,
        taxRateBp: resolveRateBp(variant.taxRateBp, settings.tax.defaultRateBp),
        costMinor: variant.costMinor,
        stockTracked: variant.trackInventory,
        available: !unavailable,
        flags: {
          unavailable,
          priceChanged: item.unitPriceMinor !== undefined && item.unitPriceMinor !== variant.priceMinor,
          quantityAdjusted: clamped.adjusted,
        },
      });
    }

    const priced = lines.filter((line) => line.available);
    const itemTotals = computeOrderTotals(
      priced.map((line) => ({ amountMinor: line.lineTotalMinor, taxRateBp: line.taxRateBp })),
      null,
      settings.tax,
    );

    const methods = await this.deps.shipping.listActive();
    const shippingOptions = methods.map((method) => ({
      id: method.id,
      name: method.name[input.locale],
      kind: method.kind,
      costMinor: shippingCostMinor(
        { kind: method.kind, priceMinor: method.priceMinor, freeOverMinor: method.freeOverMinor },
        itemTotals.subtotalMinor,
      ),
    }));

    const chosen = shippingOptions.find((option) => option.id === input.shippingMethodId);
    const totals = chosen
      ? computeOrderTotals(
          priced.map((line) => ({ amountMinor: line.lineTotalMinor, taxRateBp: line.taxRateBp })),
          { amountMinor: chosen.costMinor },
          settings.tax,
        )
      : itemTotals;

    return { lines, totals, shippingOptions, paymentMethods: settings.paymentMethods };
  }
}

/**
 * Builds the quote line for a variant that no longer exists or is inactive.
 * @param variantId Requested variant id.
 * @param item Requested item.
 * @returns A line flagged as unavailable with zero totals.
 */
function unavailableLine(variantId: string, item: QuoteItem): QuotedLine {
  return {
    variantId,
    productId: '',
    slug: '',
    name: '',
    variantLabel: '',
    sku: null,
    quantity: 0,
    unitPriceMinor: item.unitPriceMinor ?? 0,
    compareAtPriceMinor: null,
    lineTotalMinor: 0,
    taxRateBp: 0,
    costMinor: null,
    stockTracked: false,
    available: false,
    flags: { unavailable: true, priceChanged: false, quantityAdjusted: false },
  };
}
