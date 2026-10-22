// What the checkout form needs besides its markup: the translated labels, and the small browser helpers it calls.
import type { PlacedOrder } from '@/application/ordering/place-order';
import type { PaymentMethod } from '@/application/ports/payments';

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
  empty: string;
  continueShopping: string;
  quoteError: string;
  formError: string;
  methods: Record<PaymentMethod, string>;
  errors: Record<string, string>;
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
