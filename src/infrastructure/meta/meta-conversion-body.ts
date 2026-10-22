// Builds the body of POST /{pixelId}/events for one conversion. Pure: the hashes are computed by the caller, so the shape can be
// checked without a network or a crypto binding. Money goes to Meta in major units (12.50), never in minor units.
import type { ConversionEvent } from '@/application/ports/analytics';
import type { TrackedEventName } from '@/domain/analytics/tracked-events';
import { majorTextOf } from '@/domain/shared/money';
import { absoluteUrl } from '@/application/documents/urls';

/** Meta's name of each tracked event. The pixel uses the same names, so Meta can match the two sides. */
export const META_EVENT_NAMES: Record<TrackedEventName, string> = {
  page_view: 'PageView',
  view_item: 'ViewContent',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  purchase: 'Purchase',
};

/** Customer identifiers already hashed (SHA-256 of the normalized value, lowercase hex). */
export interface HashedIdentifiers {
  em?: string;
  ph?: string;
}

/**
 * Builds the request body of one Conversions API event.
 * @param event Conversion to send.
 * @param hashed Hashed email and phone, empty when there is no consent.
 * @param siteUrl Public origin, without a trailing slash.
 * @param testEventCode Test code from the Meta settings, or null for live traffic.
 * @returns The JSON body.
 */
export function buildConversionBody(
  event: ConversionEvent,
  hashed: HashedIdentifiers,
  siteUrl: string,
  testEventCode: string | null,
): Record<string, unknown> {
  const major = (minor: number): number => Number(majorTextOf(minor, event.currency));
  const hasItems = event.items.length > 0;
  const userData = {
    ...(hashed.em ? { em: [hashed.em] } : {}),
    ...(hashed.ph ? { ph: [hashed.ph] } : {}),
    ...(event.ip ? { client_ip_address: event.ip } : {}),
    ...(event.userAgent ? { client_user_agent: event.userAgent } : {}),
    ...(event.fbp ? { fbp: event.fbp } : {}),
    ...(event.fbc ? { fbc: event.fbc } : {}),
  };
  const customData = {
    currency: event.currency,
    ...(event.valueMinor !== null ? { value: major(event.valueMinor) } : {}),
    ...(hasItems
      ? {
          content_type: 'product',
          // Variant ids: they match the `g:id` of the catalog feed, which is what Meta matches content_ids against.
          content_ids: event.items.map((item) => item.variantId),
          contents: event.items.map((item) => ({
            id: item.variantId,
            quantity: item.quantity,
            item_price: major(item.priceMinor),
          })),
        }
      : {}),
    ...(event.orderId ? { order_id: event.orderId } : {}),
  };
  return {
    data: [
      {
        event_name: META_EVENT_NAMES[event.name],
        event_time: Math.floor(Date.parse(event.occurredAt) / 1000),
        event_id: event.eventId,
        action_source: 'website',
        event_source_url: absoluteUrl(siteUrl, event.path),
        user_data: userData,
        custom_data: customData,
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };
}
