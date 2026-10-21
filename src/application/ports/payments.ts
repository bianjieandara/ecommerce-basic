// Payment ports. Each payment method is one gateway adapter behind this interface.
// Adding a provider means adding one adapter and registering it in create-app.ts.
import type { CurrencyCode } from '@/domain/shared/currency';
import type { CheckoutSettings, ContactSettings } from '../dto/settings-dto';
import type { OrderSummary } from '../dto/order-dto';

/** Payment methods the store can offer. Matches the CHECK constraint on orders.payment_method. */
export type PaymentMethod = 'stripe' | 'paypal' | 'whatsapp' | 'bank_transfer' | 'cash_on_delivery';

/** What the customer does next after placing an order. */
export type PaymentInitiation =
  { kind: 'redirect'; url: string; providerReference?: string } | { kind: 'confirmation' };

/** One payment gateway. */
export interface PaymentGateway {
  readonly method: PaymentMethod;
  /** True when the secrets and settings this method needs are present. */
  isConfigured(settings: CheckoutSettings, contact: ContactSettings): boolean;
  /** True when the method can charge in this currency. */
  supportsCurrency(currency: CurrencyCode, settings: CheckoutSettings): boolean;
  /** Starts the payment for a new order. */
  initiate(input: { order: OrderSummary; accessKey: string; origin: string }): Promise<PaymentInitiation>;
}

/** A normalized payment event, from a webhook or a return page. */
export interface PaymentConfirmation {
  provider: 'stripe' | 'paypal';
  eventId: string;
  providerReference: string;
  outcome: 'succeeded' | 'failed' | 'expired' | 'refunded';
  amountMinor: number;
  currency: string;
}

/** Records webhook event ids so each event is processed once. */
export interface PaymentEventLog {
  recordIfNew(provider: string, eventId: string, nowIso: string): Promise<boolean>;
}
