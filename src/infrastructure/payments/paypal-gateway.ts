// PayPal Orders v2 over REST. The customer approves on PayPal and comes back to the store, where the payment is captured.
// The PAYMENT.CAPTURE.* webhooks cover payments that finish without the customer coming back.
import { absoluteUrl } from '@/application/documents/urls';
import type { OrderSummary } from '@/application/dto/order-dto';
import type { CacheStore } from '@/application/ports/platform';
import type { PaymentConfirmation, PaymentGateway, PaymentInitiation } from '@/application/ports/payments';
import { CURRENCIES, type CurrencyCode } from '@/domain/shared/currency';
import { DomainError } from '@/domain/shared/errors';
import { PATHS, withQuery } from '@/domain/shared/paths';
import { workersFetch } from '../system/http-fetch';

/** Settings the adapter reads from its environment. */
export interface PayPalConfig {
  clientId: string | null;
  clientSecret: string | null;
  webhookId: string | null;
  environment: 'sandbox' | 'live';
}

/** Input of initiate(). PayPal needs only the order, the access key and the site URL. */
interface PayPalInitiateInput {
  order: OrderSummary;
  accessKey: string;
  origin: string;
}

/** Currencies the store can charge through PayPal. Other currencies are not offered at checkout. */
const PAYPAL_CURRENCIES: readonly CurrencyCode[] = ['USD', 'EUR'];
/** KV key of the OAuth token. */
const TOKEN_KEY = 'paypal:token';
/** Seconds before expiry at which the token is refreshed. */
const TOKEN_MARGIN_SECONDS = 300;

/** The parts of a PayPal order or capture response this adapter reads. */
interface PayPalOrderResponse {
  id?: string;
  status?: string;
  links?: { rel: string; href: string }[];
  purchase_units?: {
    payments?: {
      captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[];
    };
  }[];
  message?: string;
}

/** A webhook event as PayPal sends it. */
export interface PayPalEvent {
  id: string;
  event_type: string;
  resource: {
    amount?: { value: string; currency_code: string };
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}

/**
 * Converts a minor-unit amount to the decimal text PayPal expects.
 * @param amountMinor Amount in minor units.
 * @param currency Currency code.
 * @returns Decimal text, such as "12.50".
 */
function toMajor(amountMinor: number, currency: CurrencyCode): string {
  const exponent = CURRENCIES[currency].exponent;
  return (amountMinor / 10 ** exponent).toFixed(exponent);
}

/**
 * Converts PayPal's decimal text to minor units.
 * @param value Decimal text.
 * @param currency Currency code.
 * @returns Amount in minor units.
 */
function toMinor(value: string, currency: CurrencyCode): number {
  return Math.round(Number(value) * 10 ** CURRENCIES[currency].exponent);
}

/** PayPal checkout: approval on PayPal, capture on return, and webhook confirmation. */
export class PayPalGateway implements PaymentGateway {
  readonly method = 'paypal';

  /**
   * @param config Credentials and environment.
   * @param cache KV cache for the OAuth token.
   * @param fetcher Fetch implementation, injected for tests.
   */
  constructor(
    private readonly config: PayPalConfig,
    private readonly cache: CacheStore,
    private readonly fetcher: typeof fetch = workersFetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret);
  }

  supportsCurrency(currency: CurrencyCode): boolean {
    return PAYPAL_CURRENCIES.includes(currency);
  }

  /**
   * Creates a PayPal order and returns the page where the customer approves it.
   * @param input Order summary, access key and site URL.
   * @returns A redirect to PayPal, with the PayPal order id as the provider reference.
   * @throws DomainError PAYMENT_PROVIDER_ERROR when PayPal refuses the order.
   */
  async initiate({ order, accessKey, origin }: PayPalInitiateInput): Promise<PaymentInitiation> {
    const query = { order: String(order.number), key: accessKey };
    const response = await this.api<PayPalOrderResponse>('/v2/checkout/orders', {
      method: 'POST',
      requestId: order.id,
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: order.id,
            custom_id: String(order.number),
            amount: { currency_code: order.currency, value: toMajor(order.totalMinor, order.currency) },
          },
        ],
        application_context: {
          return_url: withQuery(absoluteUrl(origin, `${PATHS.checkout(order.locale)}/paypal-return`), query),
          cancel_url: withQuery(absoluteUrl(origin, PATHS.checkoutCancel(order.locale)), query),
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
        },
      },
    });
    const approve = response.data.links?.find(
      (link) => link.rel === 'payer-action' || link.rel === 'approve',
    );
    if (!response.ok || !response.data.id || !approve) {
      throw new DomainError(
        'PAYMENT_PROVIDER_ERROR',
        `PayPal error: ${response.data.message ?? response.status}`,
      );
    }
    return { kind: 'redirect', url: approve.href, providerReference: response.data.id };
  }

  /**
   * Captures an approved PayPal order. Repeated calls with the same request id return the first result.
   * @param providerReference PayPal order id.
   * @param requestId Idempotency key for the capture (the order id).
   * @returns The capture as a payment confirmation.
   * @throws DomainError PAYMENT_PROVIDER_ERROR when PayPal does not return a capture.
   */
  async capture(providerReference: string, requestId: string): Promise<PaymentConfirmation> {
    const response = await this.api<PayPalOrderResponse>(
      `/v2/checkout/orders/${encodeURIComponent(providerReference)}/capture`,
      { method: 'POST', requestId, body: {} },
    );
    const capture = response.data.purchase_units?.[0]?.payments?.captures?.[0];
    if (!response.ok || !capture) {
      throw new DomainError(
        'PAYMENT_PROVIDER_ERROR',
        `PayPal capture failed: ${response.data.message ?? response.status}`,
      );
    }
    const currency = capture.amount.currency_code as CurrencyCode;
    return {
      provider: 'paypal',
      eventId: `capture:${capture.id}`,
      providerReference,
      outcome: capture.status === 'COMPLETED' ? 'succeeded' : 'failed',
      amountMinor: toMinor(capture.amount.value, currency),
      currency,
    };
  }

  /**
   * Asks PayPal whether a webhook really came from PayPal for this store's webhook id.
   * @param headers Request headers of the webhook.
   * @param rawBody Body exactly as received.
   * @returns True when PayPal confirms the signature.
   */
  async verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
    if (!this.config.webhookId) return false;
    const response = await this.api<{ verification_status?: string }>(
      '/v1/notifications/verify-webhook-signature',
      {
        method: 'POST',
        body: {
          auth_algo: headers.get('paypal-auth-algo'),
          cert_url: headers.get('paypal-cert-url'),
          transmission_id: headers.get('paypal-transmission-id'),
          transmission_sig: headers.get('paypal-transmission-sig'),
          transmission_time: headers.get('paypal-transmission-time'),
          webhook_id: this.config.webhookId,
          webhook_event: JSON.parse(rawBody) as unknown,
        },
      },
    );
    return response.ok && response.data.verification_status === 'SUCCESS';
  }

  /**
   * Turns a verified PayPal event into a payment confirmation. Events the store does not act on return null.
   * @param event Parsed event body.
   * @returns The confirmation, or null.
   */
  parseEvent(event: PayPalEvent): PaymentConfirmation | null {
    const outcomes: Record<string, PaymentConfirmation['outcome'] | undefined> = {
      'PAYMENT.CAPTURE.COMPLETED': 'succeeded',
      'PAYMENT.CAPTURE.DENIED': 'failed',
    };
    const outcome = outcomes[event.event_type];
    const providerReference = event.resource.supplementary_data?.related_ids?.order_id;
    const amount = event.resource.amount;
    if (!outcome || !providerReference || !amount) return null;
    const currency = amount.currency_code as CurrencyCode;
    return {
      provider: 'paypal',
      eventId: event.id,
      providerReference,
      outcome,
      amountMinor: toMinor(amount.value, currency),
      currency,
    };
  }

  /**
   * Calls the PayPal REST API with a bearer token.
   * @param path API path, starting with "/".
   * @param init Method, JSON body and optional idempotency key.
   * @returns Status and parsed JSON body.
   */
  private async api<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown; requestId?: string },
  ): Promise<{ ok: boolean; status: number; data: T }> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await this.token()}`,
      'content-type': 'application/json',
    };
    if (init.requestId) headers['PayPal-Request-Id'] = init.requestId;
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return { ok: response.ok, status: response.status, data: (await response.json()) as T };
  }

  /** The API host for the configured environment. */
  private get baseUrl(): string {
    return this.config.environment === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  /**
   * Returns a valid OAuth token, fetching a new one when the cached token is missing or about to expire.
   * @returns Bearer token.
   * @throws DomainError PAYMENT_METHOD_UNAVAILABLE when the credentials are missing.
   */
  private async token(): Promise<string> {
    const cached = await this.cache.getJson<{ token: string }>(TOKEN_KEY);
    if (cached) return cached.token;
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new DomainError('PAYMENT_METHOD_UNAVAILABLE', 'PayPal is not configured');
    }
    const response = await this.fetcher(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${this.config.clientId}:${this.config.clientSecret}`)}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!response.ok || !data.access_token) {
      throw new DomainError('PAYMENT_PROVIDER_ERROR', 'PayPal authentication failed');
    }
    const ttl = Math.max(60, (data.expires_in ?? 0) - TOKEN_MARGIN_SECONDS);
    await this.cache.putJson(TOKEN_KEY, { token: data.access_token }, ttl);
    return data.access_token;
  }
}
