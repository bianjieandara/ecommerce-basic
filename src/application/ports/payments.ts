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

/** Payment methods whose money the store can send back through the provider. The others are refunded by hand, outside the store. */
export const REFUNDABLE_METHODS = ['dlocalgo', 'paypal'] as const satisfies readonly PaymentMethod[];

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
  /**
   * Set on a refund whose amount the provider reports in another currency than the payment (dLocal Go refunds in the buyer's
   * currency). The two cannot be compared, so the refund counts as a full one only when this store asked for it.
   */
  foreignCurrencyRefund?: boolean;
}

/**
 * The payment-event record that says the store asked its provider to refund this order. RefundOrder writes it before the call;
 * ConfirmPayment reads it to accept a refund reported in another currency.
 * @param orderId Order id.
 * @returns The event id.
 */
export function refundRequestEventId(orderId: string): string {
  return `refund-request:${orderId}`;
}

/** What a gateway needs to refund an order. The whole payment is returned: partial refunds are settled by hand. */
export interface RefundInput {
  /** The order: its id makes the request safe to repeat, its total and currency are what comes back. */
  order: { id: string; number: number; totalMinor: number; currency: string };
  /** The reference stored with the order: the dLocal Go payment id, or the PayPal order id. */
  providerReference: string;
  /** Public site URL without a trailing slash, for the address the provider reports the outcome to. */
  origin: string;
}

/** A refund the provider accepted. */
export interface RefundResult {
  /** The provider's id of the refund, written on the order's timeline. */
  providerRefundId: string;
  /** The event to apply when the provider has already finished the refund. Null while it is pending: its notification follows. */
  confirmation: PaymentConfirmation | null;
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
  /**
   * Sends the whole payment back to the customer. A definite refusal by the provider throws REFUND_REFUSED; a failure that leaves
   * it unknown whether the refund was created (a timeout) throws PAYMENT_PROVIDER_ERROR.
   */
  refund?(input: RefundInput): Promise<RefundResult>;
  /** True when asking twice for the same order's refund can never refund twice, so a failed attempt may simply be repeated. */
  readonly refundsAreIdempotent?: boolean;
}

/** Records webhook event ids so each event is processed once. */
export interface PaymentEventLog {
  recordIfNew(provider: string, eventId: string, nowIso: string): Promise<boolean>;
  /** Removes a record, so a claim made before a call that definitely failed can be made again. */
  forget(provider: string, eventId: string): Promise<void>;
  /** Whether a record exists. */
  exists(provider: string, eventId: string): Promise<boolean>;
}
