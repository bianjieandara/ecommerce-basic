// PayPal Orders v2 over REST. The customer approves on PayPal and comes back to the store, where the payment is captured.
// The PAYMENT.CAPTURE.* webhooks cover payments that finish without the customer coming back.
import { absoluteUrl } from '@/application/documents/urls';
import type { CacheStore } from '@/application/ports/platform';
import type {
  PaymentConfirmation,
  PaymentGateway,
  PaymentInitiation,
  RefundInput,
  RefundResult,
} from '@/application/ports/payments';
import type { CurrencyCode } from '@/domain/shared/currency';
import { DomainError } from '@/domain/shared/errors';
import { majorTextOf } from '@/domain/shared/money';
import { PATHS, withQuery } from '@/domain/shared/paths';
import { workersFetch } from '../system/http-fetch';
import { providerAmountMinor } from './provider-amounts';
import {
  isPayPalCertUrl,
  PAYPAL_CURRENCIES,
  TOKEN_KEY,
  TOKEN_MARGIN_SECONDS,
  type PayPalConfig,
  type PayPalEvent,
  type PayPalInitiateInput,
  type PayPalOrderResponse,
  type PayPalRefundResponse,
} from './paypal-support';
export type { PayPalConfig, PayPalEvent } from './paypal-support';

/** PayPal checkout: approval on PayPal, capture on return, and webhook confirmation. */
export class PayPalGateway implements PaymentGateway {
  readonly method = 'paypal';
  /** The refund request carries the order's id as PayPal-Request-Id, so PayPal answers a repeat with the first result. */
  readonly refundsAreIdempotent = true;

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
            amount: { currency_code: order.currency, value: majorTextOf(order.totalMinor, order.currency) },
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
      amountMinor: providerAmountMinor(capture.amount.value, currency, 'PayPal'),
      currency,
    };
  }

  /**
   * Refunds the whole capture of an order. The capture is looked up from the PayPal order, because the store keeps the order id.
   * PayPal normally completes a refund at once; a PENDING one is left for the owner to confirm in PayPal.
   * @param input The order, the PayPal order id stored with it and the site URL (unused: PayPal answers synchronously).
   * @returns The refund id, and the confirmation when the refund completed.
   * @throws DomainError REFUND_REFUSED when PayPal answers a 4xx, PAYMENT_PROVIDER_ERROR otherwise.
   */
  async refund({ order, providerReference }: RefundInput): Promise<RefundResult> {
    const found = await this.api<PayPalOrderResponse>(
      `/v2/checkout/orders/${encodeURIComponent(providerReference)}`,
      {
        method: 'GET',
      },
    );
    const capture = found.data.purchase_units?.[0]?.payments?.captures?.find(
      (item) => item.status === 'COMPLETED',
    );
    if (!found.ok || !capture) {
      throw new DomainError(
        found.ok || (found.status >= 400 && found.status < 500) ? 'REFUND_REFUSED' : 'PAYMENT_PROVIDER_ERROR',
        `PayPal has no completed capture to refund (${found.status})`,
      );
    }
    const response = await this.api<PayPalRefundResponse>(
      `/v2/payments/captures/${encodeURIComponent(capture.id)}/refund`,
      { method: 'POST', requestId: `refund:${order.id}`, body: {} },
    );
    if (!response.ok || !response.data.id) {
      const issue = response.data.details?.[0]?.issue ?? response.data.name ?? response.data.message ?? '';
      throw new DomainError(
        response.status >= 400 && response.status < 500 ? 'REFUND_REFUSED' : 'PAYMENT_PROVIDER_ERROR',
        `PayPal refund error ${response.status}: ${issue}`,
      );
    }
    if (response.data.status !== 'COMPLETED')
      return { providerRefundId: response.data.id, confirmation: null };
    const currency = (response.data.amount?.currency_code ?? order.currency) as CurrencyCode;
    return {
      providerRefundId: response.data.id,
      confirmation: {
        provider: 'paypal',
        eventId: `refund:${response.data.id}`,
        providerReference,
        outcome: 'refunded',
        amountMinor: response.data.amount
          ? providerAmountMinor(response.data.amount.value, currency, 'PayPal')
          : order.totalMinor,
        currency,
      },
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
    // A body that is not JSON cannot be a PayPal event: refuse it here instead of failing the request.
    let webhookEvent: unknown;
    try {
      webhookEvent = JSON.parse(rawBody);
    } catch {
      return false;
    }
    // Every header a real delivery carries, and a certificate on a PayPal host. A request without them is refused here, so an
    // unsigned flood costs no call to the PayPal API (each call would also spend the store's API quota).
    const signature = {
      auth_algo: headers.get('paypal-auth-algo'),
      cert_url: headers.get('paypal-cert-url'),
      transmission_id: headers.get('paypal-transmission-id'),
      transmission_sig: headers.get('paypal-transmission-sig'),
      transmission_time: headers.get('paypal-transmission-time'),
    };
    if (Object.values(signature).some((value) => !value) || !isPayPalCertUrl(signature.cert_url ?? ''))
      return false;
    const response = await this.api<{ verification_status?: string }>(
      '/v1/notifications/verify-webhook-signature',
      {
        method: 'POST',
        body: {
          ...signature,
          webhook_id: this.config.webhookId,
          webhook_event: webhookEvent,
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
      amountMinor: providerAmountMinor(amount.value, currency, 'PayPal'),
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
