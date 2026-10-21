// Stripe Checkout (hosted payment page), called over REST. The SDK is not used: the store needs two endpoints and one
// signature check, and plain fetch runs anywhere Workers do.
import { absoluteUrl } from '@/application/documents/urls';
import type { OrderSummary } from '@/application/dto/order-dto';
import type { PaymentConfirmation, PaymentGateway, PaymentInitiation } from '@/application/ports/payments';
import { constantTimeEqual } from '@/domain/shared/constant-time';
import { DomainError } from '@/domain/shared/errors';
import { PATHS, withQuery } from '@/domain/shared/paths';
import { workersFetch } from '../system/http-fetch';

const API_BASE = 'https://api.stripe.com/v1';
/** Webhook signatures older than this are rejected, which stops replays. */
const MAX_SIGNATURE_AGE_SECONDS = 300;
/** Stripe accepts sessions that expire between 30 minutes and 24 hours from now. */
const MIN_SESSION_MS = 30 * 60_000;
const MAX_SESSION_MS = 24 * 60 * 60_000;

/** The parts of a Checkout Session this adapter reads. */
export interface StripeSession {
  id: string;
  amount_total: number | null;
  currency: string;
  payment_status: string;
}

/** The parts of a Stripe event this adapter reads. */
export interface StripeEvent {
  id: string;
  type: string;
  data: { object: StripeSession };
}

/** Input of initiate(). Stripe needs only the order, the access key and the site URL. */
interface StripeInitiateInput {
  order: OrderSummary;
  accessKey: string;
  origin: string;
}

/** Stripe card payments through Checkout. */
export class StripeGateway implements PaymentGateway {
  readonly method = 'stripe';

  /**
   * @param secretKey Secret API key, or null when not configured.
   * @param webhookSecret Webhook signing secret, or null when not configured.
   * @param fetcher Fetch implementation, injected for tests.
   */
  constructor(
    private readonly secretKey: string | null,
    private readonly webhookSecret: string | null,
    private readonly fetcher: typeof fetch = workersFetch,
  ) {}

  isConfigured(): boolean {
    return this.secretKey !== null && this.webhookSecret !== null;
  }

  supportsCurrency(): boolean {
    return true;
  }

  /**
   * Creates a Checkout Session for the order and returns its page.
   * @param input Order summary, access key and site URL.
   * @returns A redirect to the session page, with the session id as the provider reference.
   * @throws DomainError PAYMENT_PROVIDER_ERROR when Stripe refuses the session.
   */
  async initiate({ order, accessKey, origin }: StripeInitiateInput): Promise<PaymentInitiation> {
    if (!this.secretKey)
      throw new DomainError('PAYMENT_METHOD_UNAVAILABLE', 'Card payments are not configured');
    const now = Date.now();
    const holdMs = order.expiresAt ? Date.parse(order.expiresAt) - now : 0;
    const expiresMs = now + Math.min(MAX_SESSION_MS, Math.max(MIN_SESSION_MS, holdMs));
    const query = { order: String(order.number), key: accessKey };
    const body = new URLSearchParams({
      mode: 'payment',
      client_reference_id: order.id,
      customer_email: order.customerEmail,
      locale: order.locale,
      expires_at: String(Math.floor(expiresMs / 1000)),
      success_url: withQuery(absoluteUrl(origin, PATHS.checkoutSuccess(order.locale)), query),
      cancel_url: withQuery(absoluteUrl(origin, PATHS.checkoutCancel(order.locale)), query),
      'metadata[order_id]': order.id,
      'metadata[order_number]': String(order.number),
    });

    const currency = order.currency.toLowerCase();
    const lines: { name: string; unitAmount: number; quantity: number }[] = order.items.map((item) => ({
      name: item.name,
      unitAmount: item.unitPriceMinor,
      quantity: item.quantity,
    }));
    const labels =
      order.locale === 'es' ? { tax: 'Impuestos', shipping: 'Envío' } : { tax: 'Tax', shipping: 'Shipping' };
    // When prices exclude tax, the tax is charged as its own line so the session total matches the order total.
    if (!order.pricesIncludeTax && order.taxMinor > 0) {
      lines.push({ name: labels.tax, unitAmount: order.taxMinor, quantity: 1 });
    }
    if (order.shippingMinor > 0)
      lines.push({ name: labels.shipping, unitAmount: order.shippingMinor, quantity: 1 });
    lines.forEach((line, index) => {
      body.set(`line_items[${index}][quantity]`, String(line.quantity));
      body.set(`line_items[${index}][price_data][currency]`, currency);
      body.set(`line_items[${index}][price_data][unit_amount]`, String(line.unitAmount));
      body.set(`line_items[${index}][price_data][product_data][name]`, line.name);
    });

    const response = await this.fetcher(`${API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': `checkout:${order.id}`,
      },
      body,
    });
    const data = (await response.json()) as {
      id?: string;
      url?: string | null;
      error?: { message?: string };
    };
    if (!response.ok || !data.id || !data.url) {
      throw new DomainError(
        'PAYMENT_PROVIDER_ERROR',
        `Stripe error: ${data.error?.message ?? response.status}`,
      );
    }
    return { kind: 'redirect', url: data.url, providerReference: data.id };
  }

  /**
   * Checks the Stripe-Signature header against the raw request body.
   * @param rawBody Body exactly as received.
   * @param header Stripe-Signature header value.
   * @param nowSeconds Current time in Unix seconds.
   * @returns True when one signature matches and the timestamp is recent.
   */
  async verifyWebhook(rawBody: string, header: string | null, nowSeconds: number): Promise<boolean> {
    if (!this.webhookSecret || !header) return false;
    const parts = header.split(',').map((part) => part.trim());
    const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2) ?? '';
    const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
    if (!timestamp || signatures.length === 0) return false;
    if (Math.abs(nowSeconds - Number(timestamp)) > MAX_SIGNATURE_AGE_SECONDS) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
    const expected = Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return signatures.some((signature) => constantTimeEqual(signature, expected));
  }

  /**
   * Turns a verified Stripe event into a payment confirmation. Events the store does not act on return null.
   * @param event Parsed event body.
   * @returns The confirmation, or null.
   */
  parseEvent(event: StripeEvent): PaymentConfirmation | null {
    const session = event.data.object;
    const confirm = (outcome: PaymentConfirmation['outcome']): PaymentConfirmation => ({
      provider: 'stripe',
      eventId: event.id,
      providerReference: session.id,
      outcome,
      amountMinor: session.amount_total ?? 0,
      currency: session.currency.toUpperCase(),
    });
    switch (event.type) {
      // Delayed methods (bank debits) complete later with async_payment_succeeded.
      case 'checkout.session.completed':
        return session.payment_status === 'paid' ? confirm('succeeded') : null;
      case 'checkout.session.async_payment_succeeded':
        return confirm('succeeded');
      case 'checkout.session.async_payment_failed':
        return confirm('failed');
      case 'checkout.session.expired':
        return confirm('expired');
      default:
        return null;
    }
  }
}
