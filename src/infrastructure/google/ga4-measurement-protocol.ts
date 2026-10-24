// Sends purchases to GA4's Measurement Protocol (POST /mp/collect). The API secret travels in the query string, as Google requires,
// so it is never put in an error message or a log line. Google answers 2xx even for a body it does not understand, so the body is
// built from checked values only. Temporary failures come back as RetryableError, so the queue retries them.
import type { Ga4Purchase, Ga4Sink } from '@/application/ports/analytics';
import { GA4_MEASUREMENT_ID } from '@/domain/consent/consent';
import { DomainError, RetryableError } from '@/domain/shared/errors';
import { majorTextOf } from '@/domain/shared/money';
import { workersFetch } from '@/infrastructure/system/http-fetch';

/** Longest a request may take before it is abandoned. */
const TIMEOUT_MS = 10_000;

/** Where Google collects events. GA4_MP_BASE_URL points it at a test double in local runs. */
const DEFAULT_BASE_URL = 'https://www.google-analytics.com';

/** Connection settings of the sink. */
export interface Ga4MeasurementProtocolConfig {
  /** The property's API secret (GA4_API_SECRET), or null until the store has one. Never logged. */
  apiSecret: string | null;
  baseUrl?: string | null;
}

/**
 * Money for GA4 as a number in major units. Google's protocol takes numbers, so this is where a store amount becomes a decimal;
 * the text conversion keeps it exact up to the last digit that matters.
 * @param amountMinor Amount in minor units.
 * @param currency Currency of the purchase.
 * @returns The amount in major units.
 */
function major(amountMinor: number, currency: Ga4Purchase['currency']): number {
  return Number(majorTextOf(amountMinor, currency));
}

/**
 * Builds the Measurement Protocol body of a purchase.
 * @param purchase The purchase.
 * @returns The JSON body.
 */
export function buildPurchaseBody(purchase: Ga4Purchase): Record<string, unknown> {
  return {
    client_id: purchase.clientId,
    events: [
      {
        name: 'purchase',
        params: {
          transaction_id: purchase.transactionId,
          currency: purchase.currency,
          value: major(purchase.valueMinor, purchase.currency),
          tax: major(purchase.taxMinor, purchase.currency),
          shipping: major(purchase.shippingMinor, purchase.currency),
          items: purchase.items.map((item) => ({
            item_id: item.variantId,
            price: major(item.priceMinor, purchase.currency),
            quantity: item.quantity,
          })),
          // Without a session id GA4 would count the purchase as a visit of its own; with it, the purchase joins the visit
          // where the buyer arrived. The engagement time makes the event show in the reports.
          ...(purchase.sessionId ? { session_id: purchase.sessionId } : {}),
          engagement_time_msec: 1,
        },
      },
    ],
  };
}

/** Sends purchases to the Measurement Protocol endpoint. */
export class Ga4MeasurementProtocolSink implements Ga4Sink {
  /**
   * @param config API secret and, for tests, the base URL.
   * @param fetcher Fetch implementation; the default is the Workers-safe wrapper.
   */
  constructor(
    private readonly config: Ga4MeasurementProtocolConfig,
    private readonly fetcher: typeof fetch = workersFetch,
  ) {}

  /** True when the API secret is set. */
  isConfigured(): boolean {
    return this.config.apiSecret !== null;
  }

  /**
   * Sends one purchase.
   * @param purchase The purchase.
   * @param measurementId The property's measurement ID (G-…). A malformed one is refused before any request.
   * @throws DomainError INVALID_STATE without an API secret, VALIDATION_FAILED for a malformed id or a rejected request.
   * @throws RetryableError for rate limits, server errors, timeouts and network failures.
   */
  async send(purchase: Ga4Purchase, measurementId: string): Promise<void> {
    if (this.config.apiSecret === null) {
      throw new DomainError('INVALID_STATE', 'GA4 is not configured.', { reason: 'NO_API_SECRET' });
    }
    if (!GA4_MEASUREMENT_ID.test(measurementId)) {
      throw new DomainError('VALIDATION_FAILED', 'The GA4 measurement ID is malformed.');
    }
    const url = new URL(`${this.config.baseUrl ?? DEFAULT_BASE_URL}/mp/collect`);
    url.searchParams.set('measurement_id', measurementId);
    url.searchParams.set('api_secret', this.config.apiSecret);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildPurchaseBody(purchase)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // The thrown value can carry the request URL, and the URL carries the secret: only the fact is reported.
      throw new RetryableError('GA4 request failed');
    }
    if (response.ok) return;
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableError(`GA4 answered ${response.status}`);
    }
    throw new DomainError('VALIDATION_FAILED', `GA4 refused the purchase (${response.status})`);
  }
}
