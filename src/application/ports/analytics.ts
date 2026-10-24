// Analytics ports: the event shape the tracking use case builds, and the writer for Workers Analytics Engine.
// Events carry raw context (IP, user agent) so marketing sinks can use it; the Analytics Engine writer must not store it.
import type { TrackedEventName } from '@/domain/analytics/tracked-events';
import type { CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';
import type { Money } from '@/domain/shared/money';

export type { TrackedEventName } from '@/domain/analytics/tracked-events';

/** Campaign parameters of the landing URL. Only these keys are kept; the rest of the query string is dropped. */
export type UtmParams = Partial<Record<'source' | 'medium' | 'campaign' | 'term' | 'content', string>>;

/** One product line of an event. */
export interface TrackedItem {
  productId: string;
  variantId: string;
  quantity: number;
  priceMinor: number;
}

/** One tracked event as the application sees it, after validation. */
export interface TrackedEvent {
  /** Unique id; the Meta Pixel and the Conversions API send the same id so Meta deduplicates them. */
  id: string;
  name: TrackedEventName;
  occurredAt: string;
  /** Page path of the event, for example "/es/products/mochila". No origin and no query string. */
  url: string;
  locale: Locale;
  value?: Money;
  items?: TrackedItem[];
  orderId?: string;
  context: {
    ip: string | null;
    userAgent: string | null;
    country: string | null;
    device: 'mobile' | 'tablet' | 'desktop';
    referrerHost: string | null;
    utm: UtmParams;
    fbp?: string;
    fbc?: string;
    marketingConsent: boolean;
  };
  customer?: { email?: string; phone?: string };
}

/** Writes one event to the first-party analytics store. Must never throw into the caller. */
export interface AnalyticsWriter {
  write(event: TrackedEvent): void;
}

/**
 * One event for the Conversions API, as the job queue carries it. Customer data (email, phone) is present only when the
 * visitor granted marketing consent; the sink hashes it and never logs it.
 */
export interface ConversionEvent {
  /** Same id the browser pixel sends, so Meta counts an event sent by both sides once. */
  eventId: string;
  name: TrackedEventName;
  occurredAt: string;
  /** Path of the page, with no origin. The sink adds the site URL. */
  path: string;
  currency: CurrencyCode;
  /** Value in minor units, or null when the event has no value. */
  valueMinor: number | null;
  items: TrackedItem[];
  orderId: string | null;
  ip: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  email: string | null;
  phone: string | null;
}

/** Meta settings the sink needs for one send. */
export interface ConversionSettings {
  pixelId: string;
  testEventCode: string | null;
  /** Calling code added to phones typed without one, so the hash carries the country as Meta requires (for example "57"). */
  defaultCountryCode: string;
}

/** Sends events to Meta's Conversions API. Temporary failures throw RetryableError, so the queue retries them. */
export interface ConversionsSink {
  /** False when the Graph client has no version or token. The handler then skips the job instead of failing it. */
  isConfigured(): boolean;
  send(event: ConversionEvent, settings: ConversionSettings): Promise<void>;
}

/** One purchase for GA4's Measurement Protocol, as the job queue carries it. Sent only for orders whose buyer granted marketing. */
export interface Ga4Purchase {
  /** The order id. GA4 counts a transaction id once, so this purchase and the browser's are one sale. */
  transactionId: string;
  /** Visitor id read from the buyer's `_ga` cookie at checkout. */
  clientId: string;
  /** Session id from the buyer's `_ga_<id>` cookie, or null. It lets GA4 credit the purchase to the session's traffic source. */
  sessionId: string | null;
  currency: CurrencyCode;
  valueMinor: number;
  taxMinor: number;
  shippingMinor: number;
  items: TrackedItem[];
}

/** Sends purchases to GA4's Measurement Protocol. Temporary failures throw RetryableError, so the queue retries them. */
export interface Ga4Sink {
  /** False when the API secret is missing. The handler then skips the job instead of failing it. */
  isConfigured(): boolean;
  send(purchase: Ga4Purchase, measurementId: string): Promise<void>;
}
