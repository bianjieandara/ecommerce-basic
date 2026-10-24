// What the checkout form needs besides its markup: the translated labels, and the small browser helpers it calls.
import type { PlacedOrder } from '@/application/ordering/place-order';
import type { PaymentMethod } from '@/application/ports/payments';
import { track } from '@/ui/lib/track';

/** Labels of the checkout form. Translated on the server; error labels are keyed by error code. */
export interface CheckoutLabels {
  contact: string;
  delivery: string;
  payment: string;
  summary: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  address2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  note: string;
  whatsappOptIn: string;
  invoiceData: string;
  legalName: string;
  taxId: string;
  placeOrder: string;
  placing: string;
  subtotal: string;
  tax: string;
  shipping: string;
  total: string;
  shippingPending: string;
  /** Shown instead of a price when a shipping option costs nothing (pickup, or a flat rate waived by the threshold). */
  shippingFree: string;
  empty: string;
  continueShopping: string;
  quoteError: string;
  formError: string;
  methods: Record<PaymentMethod, string>;
  errors: Record<string, string>;
}

/**
 * Reports that the shopper reached the checkout with a cart. Value and prices come from the browser's cart: this is analytics,
 * and the order itself is priced by the server.
 * @param lines Cart lines.
 */
export function trackBeginCheckout(
  lines: { productId: string; variantId: string; quantity: number; unitPriceMinor: number }[],
): void {
  track('begin_checkout', {
    items: lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      priceMinor: line.unitPriceMinor,
    })),
    valueMinor: lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0),
  });
}

/**
 * Sends the customer to the next step. Online methods go to the provider page. WhatsApp opens the chat in a new tab and
 * this tab shows the order. The manual methods go straight to the order page.
 * @param order Result of the checkout request.
 * @param chosen Payment method the customer picked.
 */
export function goToNextStep(order: PlacedOrder, chosen: PaymentMethod): void {
  if (order.next.kind === 'redirect' && chosen !== 'whatsapp') {
    window.location.assign(order.next.url);
    return;
  }
  if (order.next.kind === 'redirect') window.open(order.next.url, '_blank', 'noopener');
  window.location.assign(order.orderPath);
}
