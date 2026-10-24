// Google Analytics 4 in the browser. The gtag.js script is injected only after marketing consent, like the Meta Pixel,
// so no request reaches Google before the visitor agrees. Nothing here may throw into the shopper's page.
import type { TrackedItem } from '@/application/ports/analytics';

/** Where Google serves gtag.js. */
const GTAG_URL = 'https://www.googletagmanager.com/gtag/js';

/** The gtag function and the queue it writes to, as gtag.js expects them on the window. */
interface Ga4Window extends Window {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}

/**
 * Creates the gtag queue and loads gtag.js, the way Google's snippet does. Calls made before the script arrives are queued.
 * Page views are sent by hand (`send_page_view: false`), so a page view is counted once per `track('page_view')`.
 * @param measurementId GA4 measurement ID, already checked against `GA4_MEASUREMENT_ID`.
 */
export function loadGa4(measurementId: string): void {
  const win = window as Ga4Window;
  if (win.gtag) return;
  const queue: unknown[] = (win.dataLayer = win.dataLayer ?? []);
  // gtag.js only understands `arguments` objects in the queue; pushing an array of the same values would be ignored.
  win.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    queue.push(arguments);
  };
  const script = document.createElement('script');
  script.async = true;
  script.src = `${GTAG_URL}?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
  win.gtag('js', new Date());
  win.gtag('config', measurementId, { send_page_view: false });
}

/**
 * Sends one event to GA4. The store's event names are GA4's own recommended names, so they go through unchanged.
 * @param name Store event name (page_view, view_item, add_to_cart, begin_checkout, purchase).
 * @param data Items, the value in major units and the store currency, as far as the event has them.
 */
export function sendGa4Event(
  name: string,
  data: { items?: TrackedItem[]; value?: number; currency: string; transactionId?: string },
): void {
  const gtag = (window as Ga4Window).gtag;
  if (!gtag) return;
  const params: Record<string, unknown> = {};
  if (data.items?.length) {
    params.items = data.items.map((item) => ({ item_id: item.variantId, quantity: item.quantity }));
    params.currency = data.currency;
  }
  if (data.value !== undefined) {
    params.value = data.value;
    params.currency = data.currency;
  }
  if (data.transactionId) params.transaction_id = data.transactionId;
  gtag('event', name, params);
}
