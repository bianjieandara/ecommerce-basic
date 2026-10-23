// Payment ports. Each payment method is one gateway adapter behind this interface. Adding a provider means adding one
// adapter and wiring it in composition/create-container.ts.
import type { CurrencyCode } from '@/domain/shared/currency';
import type { OrderSummary } from '../dto/order-dto';
import type { CheckoutSettings, ContactSettings } from '../dto/settings-dto';

/**
 * Payment methods the store can offer. The CHECK constraint on orders.payment_method also keeps the id of the card gateway that
 * dLocal Go replaced (see migration 0003), so orders stored with it stay valid.
 */
export const PAYMENT_METHODS = [
  'dlocalgo',
  'paypal',
  'whatsapp',
  'bank_transfer',
  'cash_on_delivery',
] as const;

/** One payment method. */
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** What the customer does next after placing an order. */
export type PaymentInitiation =
  { kind: 'redirect'; url: string; providerReference?: string } | { kind: 'confirmation' };

/** The settings a gateway reads when it starts a payment. */
export interface GatewaySettings {
  checkout: CheckoutSettings;
  contact: ContactSettings;
  /** Store country (ISO 3166-1 alpha-2). Providers that ask for the buyer's country send it. */
  country: string;
}

/** A normalized payment event, from a webhook, a return page or a capture. */
export interface PaymentConfirmation {
  provider: 'dlocalgo' | 'paypal';
  eventId: string;
  providerReference: string;
  outcome: 'succeeded' | 'failed' | 'expired' | 'refunded';
  amountMinor: number;
  currency: string;
}

/** One payment gateway. */
export interface PaymentGateway {
  readonly method: PaymentMethod;
  /** True when the secrets and settings this method needs are present. */
  isConfigured(settings: GatewaySettings): boolean;
  /** True when the method can charge in this currency. */
  supportsCurrency(currency: CurrencyCode): boolean;
  /** Starts the payment for a new order. `origin` is the public site URL without a trailing slash. */
  initiate(input: {
    order: OrderSummary;
    accessKey: string;
    origin: string;
    settings: GatewaySettings;
  }): Promise<PaymentInitiation>;
  /**
   * Settles a payment when the customer returns to the store: PayPal captures the approved order, dLocal Go reads the payment's
   * status. Null means there is nothing to apply yet (the payment is still pending). Only gateways whose customers return need it.
   */
  capture?(providerReference: string, requestId: string): Promise<PaymentConfirmation | null>;
}

/** Records webhook event ids so each event is processed once. */
export interface PaymentEventLog {
  recordIfNew(provider: string, eventId: string, nowIso: string): Promise<boolean>;
}
