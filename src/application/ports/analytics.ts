// Analytics ports: the event shape the tracking use case builds, and the writer for Workers Analytics Engine.
// Events carry raw context (IP, user agent) so marketing sinks can use it; the Analytics Engine writer must not store it.
import type { Locale } from '@/domain/shared/locale';
import type { Money } from '@/domain/shared/money';

/** Events the store tracks. Names are the same in the database, the docs and the Meta mapping. */
export type TrackedEventName = 'page_view' | 'view_item' | 'add_to_cart' | 'begin_checkout' | 'purchase';

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
