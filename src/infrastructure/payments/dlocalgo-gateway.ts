// dLocal Go card payments over REST. The customer pays on dLocal Go's hosted checkout and comes back to the store. dLocal Go calls
// the notification URL on every status change; the store never trusts that call's content: it verifies the signature, then asks
// dLocal Go for the payment, and only that answer can mark an order paid.
import { absoluteUrl } from '@/application/documents/urls';
import type { OrderSummary } from '@/application/dto/order-dto';
import type { PaymentConfirmation, PaymentGateway, PaymentInitiation } from '@/application/ports/payments';
import { constantTimeEqual } from '@/domain/shared/constant-time';
import type { CurrencyCode } from '@/domain/shared/currency';
import { DomainError } from '@/domain/shared/errors';
import { majorTextOf } from '@/domain/shared/money';
import { PATHS, withQuery } from '@/domain/shared/paths';
import { workersFetch } from '../system/http-fetch';
import {
  DLOCALGO_HOSTS,
  MAX_CHECKOUT_MINUTES,
  MIN_CHECKOUT_MINUTES,
  type DLocalGoConfig,
  type DLocalGoNotification,
  type DLocalGoPayment,
  type DLocalGoRefund,
} from './dlocalgo-support';
import { providerAmountMinor } from './provider-amounts';

export type { DLocalGoConfig, DLocalGoNotification } from './dlocalgo-support';

/** Prefix of refund ids ("REF-213"); payment ids start with "DP-". */
const REFUND_PREFIX = 'REF-';

/** Input of initiate(). The country comes from the store settings; the rest from the order. */
interface DLocalGoInitiateInput {
  order: OrderSummary;
  accessKey: string;
  origin: string;
  settings: { country: string };
}

/** dLocal Go checkout: hosted payment page, status check on return, signed notifications and refunds. */
export class DLocalGoGateway implements PaymentGateway {
  readonly method = 'dlocalgo';

  /**
   * @param config Keys and environment.
   * @param fetcher Fetch implementation, injected for tests.
   */
  constructor(
    private readonly config: DLocalGoConfig,
    private readonly fetcher: typeof fetch = workersFetch,
  ) {}

  isConfigured(): boolean {
    return this.config.apiKey !== null && this.config.secretKey !== null;
  }

  supportsCurrency(): boolean {
    // dLocal Go converts to the buyer's local currency at checkout; an unsupported currency is refused by the API at initiate().
    return true;
  }

  /**
   * Creates a dLocal Go payment for the order and returns its checkout page.
   * @param input Order summary, access key, site URL and the store country.
   * @returns A redirect to the checkout page, with the dLocal Go payment id as the provider reference.
   * @throws DomainError PAYMENT_METHOD_UNAVAILABLE when the keys are missing, PAYMENT_PROVIDER_ERROR when dLocal Go refuses.
   */
  async initiate({ order, accessKey, origin, settings }: DLocalGoInitiateInput): Promise<PaymentInitiation> {
    const query = { order: String(order.number), key: accessKey };
    const holdMinutes = order.expiresAt ? Math.ceil((Date.parse(order.expiresAt) - Date.now()) / 60_000) : 0;
    const response = await this.api<DLocalGoPayment>('/v1/payments', {
      method: 'POST',
      body: {
        currency: order.currency,
        // The API takes a decimal number in the payment currency. It is built from the integer digits, never by division.
        amount: Number(majorTextOf(order.totalMinor, order.currency)),
        country: settings.country,
        order_id: String(order.number),
        description: `Order ${order.number}`,
        payer: { email: order.customerEmail },
        success_url: withQuery(absoluteUrl(origin, PATHS.checkoutSuccess(order.locale)), query),
        back_url: withQuery(absoluteUrl(origin, PATHS.checkoutCancel(order.locale)), query),
        notification_url: absoluteUrl(origin, '/api/webhooks/dlocalgo'),
        expiration_type: 'MINUTES',
        expiration_value: Math.min(MAX_CHECKOUT_MINUTES, Math.max(MIN_CHECKOUT_MINUTES, holdMinutes)),
      },
    });
    if (!response.ok || !response.data.id || !response.data.redirect_url) {
      throw new DomainError('PAYMENT_PROVIDER_ERROR', `dLocal Go error: ${response.status}`);
    }
    return { kind: 'redirect', url: response.data.redirect_url, providerReference: response.data.id };
  }

  /**
   * Asks dLocal Go for the payment and turns its status into a confirmation. Used when the customer comes back to the store, so
   * an order is confirmed even when the notification is late, and by the notification handler.
   * @param providerReference dLocal Go payment id stored with the order.
   * @returns The confirmation, or null while the payment is still pending.
   * @throws DomainError PAYMENT_PROVIDER_ERROR when dLocal Go does not answer with the payment.
   */
  async capture(providerReference: string): Promise<PaymentConfirmation | null> {
    const response = await this.api<DLocalGoPayment>(`/v1/payments/${encodeURIComponent(providerReference)}`);
    const payment = response.data;
    if (!response.ok || payment.id !== providerReference) {
      throw new DomainError('PAYMENT_PROVIDER_ERROR', `dLocal Go error: ${response.status}`);
    }
    // REJECTED is not final: the buyer can retry inside the same checkout, so cancelling the order here could release stock under
    // a buyer who then pays. It waits like PENDING; the order's own hold time expires it if nobody pays.
    const outcomes = { PAID: 'succeeded', CANCELLED: 'failed', EXPIRED: 'expired' } as const;
    const outcome = outcomes[payment.status as keyof typeof outcomes];
    if (!outcome) return null;
    // The event id carries the status, so each status is recorded once and a repeat of the same one changes nothing.
    const currency = payment.currency as CurrencyCode;
    return {
      provider: 'dlocalgo',
      eventId: `${payment.id}:${payment.status}`,
      providerReference: payment.id,
      outcome,
      amountMinor: providerAmountMinor(payment.amount, currency, 'dLocal Go'),
      currency,
    };
  }

  /**
   * Checks the signature of a notification: HMAC-SHA256 of the API key followed by the raw body, keyed with the secret key, as
   * the Authorization header "V2-HMAC-SHA256, Signature: <hex>" carries it.
   * @param rawBody Body exactly as received.
   * @param authorization Value of the Authorization header.
   * @returns True when the signature matches.
   */
  async verifyWebhook(rawBody: string, authorization: string | null): Promise<boolean> {
    const { apiKey, secretKey } = this.config;
    if (!apiKey || !secretKey || !authorization) return false;
    const received = /Signature:\s*([0-9a-f]{64})/i.exec(authorization)?.[1];
    if (!received) return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${apiKey}${rawBody}`));
    const expected = Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return constantTimeEqual(received.toLowerCase(), expected);
  }

  /**
   * Turns a verified notification into a payment confirmation by asking dLocal Go for the object it names.
   * @param notification Parsed notification body.
   * @returns The confirmation, or null for a pending payment, an unfinished or partial refund, or an unknown body.
   * @throws DomainError PAYMENT_PROVIDER_ERROR when the lookup fails, so the webhook answers an error and dLocal Go retries.
   */
  async confirmationFor(notification: DLocalGoNotification): Promise<PaymentConfirmation | null> {
    const id = notification.refund_id ?? notification.payment_id;
    if (!id) return null;
    if (!id.startsWith(REFUND_PREFIX)) return this.capture(id);

    const refundResponse = await this.api<DLocalGoRefund>(`/v1/refunds/${encodeURIComponent(id)}`);
    const refund = refundResponse.data;
    if (!refundResponse.ok || refund.id !== id) {
      throw new DomainError('PAYMENT_PROVIDER_ERROR', `dLocal Go error: ${refundResponse.status}`);
    }
    if (refund.status !== 'SUCCESS') return null;
    const payment = await this.capture(refund.payment_id);
    const currency = refund.currency as CurrencyCode;
    // Only a full refund moves the order to refunded. A partial one leaves the order paid, for the store to settle by hand.
    if (!payment || providerAmountMinor(refund.amount, currency, 'dLocal Go') !== payment.amountMinor)
      return null;
    return { ...payment, eventId: `${refund.id}:SUCCESS`, outcome: 'refunded' };
  }

  /**
   * Calls the dLocal Go API with the store's keys.
   * @param path Path below the host.
   * @param init Method and JSON body.
   * @returns Status and parsed body.
   */
  private async api<T>(
    path: string,
    init: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ): Promise<{ ok: boolean; status: number; data: T }> {
    const { apiKey, secretKey, environment } = this.config;
    if (!apiKey || !secretKey) {
      throw new DomainError('PAYMENT_METHOD_UNAVAILABLE', 'Card payments are not configured');
    }
    const response = await this.fetcher(`${DLOCALGO_HOSTS[environment]}${path}`, {
      method: init.method ?? 'GET',
      headers: { authorization: `Bearer ${apiKey}:${secretKey}`, 'content-type': 'application/json' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    return { ok: response.ok, status: response.status, data: (await response.json().catch(() => ({}))) as T };
  }
}
