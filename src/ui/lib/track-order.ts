// Purchase event of the order page. The page puts the order's facts in a data attribute only while the order is paid and
// recent; the browser sends the Purchase once per order, after marketing consent, with the id the server uses too.
// A page that loads before the payment is confirmed sends nothing, and a later visit sends it.
import type { Order } from '@/application/dto/order-dto';
import type { TrackedItem } from '@/application/ports/analytics';
import { purchaseEventId } from '@/domain/analytics/tracked-events';
import { isPaidOrLater } from '@/domain/ordering/order-status';
import type { TrackData } from './track';

/** Selector of the element the order page renders when there is a purchase to report. */
const PURCHASE_SELECTOR = '[data-purchase]';

/**
 * Orders paid longer ago than this are not reported from the browser. Meta only deduplicates events within 48 hours, so an old
 * order opened from an email in a new browser would be counted twice there.
 */
const REPORT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** What the order page hands to the browser. */
interface PurchasePayload {
  orderId: string;
  valueMinor: number;
  items: TrackedItem[];
}

/**
 * Value of the `data-purchase` attribute for an order, or null when the browser should not report it.
 * @param order The order of the page.
 * @param nowMs Current time in milliseconds.
 * @returns JSON for the attribute, or null when the order is not paid, or was paid outside the report window.
 */
export function purchaseAttribute(order: Order, nowMs: number): string | null {
  if (!isPaidOrLater(order.status) || !order.paidAt) return null;
  if (nowMs - Date.parse(order.paidAt) > REPORT_WINDOW_MS) return null;
  const payload: PurchasePayload = {
    orderId: order.id,
    valueMinor: order.totalMinor,
    items: order.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      priceMinor: item.unitPriceMinor,
    })),
  };
  return JSON.stringify(payload);
}

/**
 * Reads the payload from the page, or null when there is none or it is malformed.
 * @returns The payload.
 */
function readPayload(): PurchasePayload | null {
  const raw = document.querySelector<HTMLElement>(PURCHASE_SELECTOR)?.dataset.purchase;
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as PurchasePayload;
    return typeof payload.orderId === 'string' && Array.isArray(payload.items) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Sends the Purchase of the page's order, once per order and browser. Does nothing when there is no tool to send to, when the
 * visitor has not granted marketing, or when this browser already sent it. GA4 (transaction id) and Meta (event id) also
 * deduplicate, which covers a browser whose storage is blocked.
 * @param canTrack Whether a tool is configured and marketing is granted.
 * @param send Sends one event to the tools; it is `track('purchase', data)`.
 */
export function trackOrderPurchase(canTrack: () => boolean, send: (data: TrackData) => void): void {
  const payload = readPayload();
  if (!payload || !canTrack()) return;
  const sentKey = `purchase-sent:${payload.orderId}`;
  try {
    if (localStorage.getItem(sentKey)) return;
  } catch {
    // Storage is blocked: the platforms' own deduplication still protects the count.
  }
  send({
    items: payload.items,
    valueMinor: payload.valueMinor,
    orderId: payload.orderId,
    eventId: purchaseEventId(payload.orderId),
  });
  try {
    localStorage.setItem(sentKey, '1');
  } catch {
    // See above.
  }
}
