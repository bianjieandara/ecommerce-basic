// Writes tracked events to Workers Analytics Engine as data points. Cookieless and aggregate: no IP, user agent,
// email, phone or fbp/fbc ever reaches the dataset. The write is synchronous and cheap, and it never throws.
import type { AnalyticsWriter, TrackedEvent } from '@/application/ports/analytics';
import { logEvent } from '@/infrastructure/system/logger';

/**
 * Turns an event into the Analytics Engine data point. Pure, so the schema can be checked without a binding.
 * The blob order is the schema in docs/ANALYTICS.md: changing it breaks saved queries, so append new fields only.
 * @param event Tracked event.
 * @param clientSlug Client the dataset belongs to; the only index, so queries can filter by client.
 * @returns Indexes, blobs and doubles in the documented order.
 */
export function toDataPoint(
  event: TrackedEvent,
  clientSlug: string,
): { indexes: string[]; blobs: string[]; doubles: number[] } {
  const first = event.items?.[0];
  const quantity = (event.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
  return {
    indexes: [clientSlug],
    blobs: [
      event.name,
      pathOf(event.url),
      first?.productId ?? '',
      first?.variantId ?? '',
      event.context.country ?? '',
      event.context.device,
      event.context.referrerHost ?? '',
      event.context.utm.source ?? '',
      event.context.utm.campaign ?? '',
      event.locale,
    ],
    doubles: [event.value?.amountMinor ?? 0, quantity],
  };
}

/**
 * Keeps only the path of an event URL, so the dataset never stores query strings (which may hold personal data).
 * @param url Event URL or path.
 * @returns The pathname, or "" when the URL cannot be parsed.
 */
function pathOf(url: string): string {
  try {
    return new URL(url, 'https://store.invalid').pathname;
  } catch {
    return '';
  }
}

/** Writes events to one Analytics Engine dataset. */
export class AnalyticsEngineSink implements AnalyticsWriter {
  /**
   * @param dataset The `EVENTS` binding.
   * @param clientSlug Client slug, written as the index.
   */
  constructor(
    private readonly dataset: AnalyticsEngineDataset,
    private readonly clientSlug: string,
  ) {}

  /**
   * Queues one data point. Failures are logged and dropped: analytics must never fail the request that triggered it.
   * @param event Tracked event.
   */
  write(event: TrackedEvent): void {
    try {
      this.dataset.writeDataPoint(toDataPoint(event, this.clientSlug));
    } catch (error) {
      // "tracked" rather than "event": logEvent spreads its data after the event name, so a field named "event" would replace it.
      logEvent('analytics.write_failed', {
        tracked: event.name,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
