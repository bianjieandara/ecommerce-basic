// Browser tracking. Each shopper event is one track() call: the Meta Pixel gets it only after marketing consent, and the
// three events the browser owns also go to /api/events, whatever the choice, because they hold no personal data.
// Nothing here may throw into the shopper's page.
import type { TrackedEventName, TrackedItem } from '@/application/ports/analytics';
import { consentCookieValue, marketingAllowed, parseConsent } from '@/domain/consent/consent';
import { CURRENCIES, isCurrencyCode, type CurrencyCode } from '@/domain/shared/currency';
import { captureAttribution, syncFbcCookie } from './attribution';

/** Window event the consent banner fires after a choice. This module enables the Pixel when it is a grant. */
export const CONSENT_CHANGE_EVENT = 'consent:change';

/** Pixel base script. It is injected only after consent, so no request reaches Meta before the visitor agrees. */
const FBEVENTS_URL = 'https://connect.facebook.net/en_US/fbevents.js';

/** Meta's standard event for each store event. Typed on the store's event names, so a new event must be mapped. */
const META_EVENT: Record<TrackedEventName, string> = {
  page_view: 'PageView',
  view_item: 'ViewContent',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  purchase: 'Purchase',
};

/**
 * Events the browser also sends to /api/events. page_view and purchase are written by the server (purchase only once
 * the payment is confirmed), so the browser never sends them there.
 */
const SENT_TO_SERVER: ReadonlySet<TrackedEventName> = new Set<TrackedEventName>([
  'view_item',
  'add_to_cart',
  'begin_checkout',
]);

/** Facts of one event. Money is in minor units, as everywhere in the store. */
export interface TrackData {
  items?: TrackedItem[];
  valueMinor?: number;
  orderId?: string;
}

/** The fbq function of Meta's Pixel, with the fields its base snippet sets. */
interface PixelFunction {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: PixelFunction;
  loaded: boolean;
  version: string;
}

/** Window with the Pixel globals. */
interface PixelWindow extends Window {
  fbq?: PixelFunction;
  _fbq?: PixelFunction;
}

/** Pixel id and the store currency, read once from the body's data attributes. */
interface PixelConfig {
  pixelId: string;
  currency: CurrencyCode;
}

let config: PixelConfig | null = null;
let pixelLoaded = false;

/**
 * Whether the visitor has granted marketing, read from the cookie in the browser.
 * @returns True only for an explicit grant.
 */
function marketingGranted(): boolean {
  return marketingAllowed(parseConsent(consentCookieValue(document.cookie)));
}

/**
 * Creates the Pixel queue and loads fbevents.js, the way Meta's base snippet does. Calls made before the script arrives are queued.
 * @param pixelId Numeric Pixel id.
 */
function loadPixel(pixelId: string): void {
  const win = window as PixelWindow;
  if (win.fbq) return;
  const fbq: PixelFunction = ((...args: unknown[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  }) as PixelFunction;
  fbq.queue = [];
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  win.fbq = fbq;
  win._fbq = fbq;
  const script = document.createElement('script');
  script.async = true;
  script.src = FBEVENTS_URL;
  document.head.appendChild(script);
  fbq('init', pixelId);
}

/** Loads the Pixel once, and only when a Pixel id is configured. */
function enablePixel(): void {
  if (!config || pixelLoaded) return;
  pixelLoaded = true;
  loadPixel(config.pixelId);
}

/**
 * Converts minor units to the major units Meta expects. This is the one place money becomes a decimal number, and it
 * only ever leaves for the Pixel; the store keeps integers everywhere else.
 * @param amountMinor Amount in minor units.
 * @param currency Store currency.
 * @returns Amount in major units.
 */
function toMajor(amountMinor: number, currency: CurrencyCode): number {
  return amountMinor / 10 ** CURRENCIES[currency].exponent;
}

/**
 * Builds Meta's parameters for an event. Content ids are variant ids, which the product feed uses as `g:id`.
 * @param name Store event name.
 * @param data Event facts.
 * @param currency Store currency.
 * @returns Parameters for fbq('track', ...).
 */
function pixelParams(
  name: TrackedEventName,
  data: TrackData,
  currency: CurrencyCode,
): Record<string, unknown> {
  if (name === 'page_view') return {};
  const items = data.items ?? [];
  const params: Record<string, unknown> = {
    content_type: 'product',
    content_ids: items.map((item) => item.variantId),
    contents: items.map((item) => ({ id: item.variantId, quantity: item.quantity })),
    num_items: items.reduce((sum, item) => sum + item.quantity, 0),
    currency,
  };
  if (data.valueMinor !== undefined) params.value = toMajor(data.valueMinor, currency);
  return params;
}

/**
 * A unique id for one event. The Pixel and the server's Conversions API send the same id, so Meta counts the event once.
 * @returns The id.
 */
function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}.${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Sends the event to the store's endpoint with sendBeacon, so it survives the navigation that often follows it.
 * The body is JSON with an application/json type; the endpoint refuses text/plain.
 * @param name Store event name.
 * @param eventId Id shared with the Pixel.
 * @param occurredAt ISO time of the event.
 * @param data Event facts.
 */
function sendToServer(name: TrackedEventName, eventId: string, occurredAt: string, data: TrackData): void {
  if (!SENT_TO_SERVER.has(name) || typeof navigator.sendBeacon !== 'function') return;
  // Only the path goes out: no origin and no query string, the same rule the server applies to stored URLs.
  const event = {
    name,
    url: location.pathname,
    occurredAt,
    eventId,
    ...(data.items ? { items: data.items } : {}),
    ...(data.valueMinor !== undefined ? { value: data.valueMinor } : {}),
    ...(data.orderId ? { orderId: data.orderId } : {}),
  };
  navigator.sendBeacon(
    '/api/events',
    new Blob([JSON.stringify({ events: [event] })], { type: 'application/json' }),
  );
}

/**
 * Records one shopper event: to the Meta Pixel after marketing consent, and to the store's endpoint for the events the browser owns.
 * @param name Store event name.
 * @param data Items, value in minor units and order id, as far as the event has them.
 */
export function track(name: TrackedEventName, data: TrackData = {}): void {
  try {
    const eventId = newEventId();
    const occurredAt = new Date().toISOString();
    if (config && marketingGranted()) {
      enablePixel();
      (window as PixelWindow).fbq?.('track', META_EVENT[name], pixelParams(name, data, config.currency), {
        eventID: eventId,
      });
    }
    sendToServer(name, eventId, occurredAt, data);
  } catch {
    // Tracking must never break the page.
  }
}

/** Runs after the visitor chooses. A grant loads the Pixel now and sends the PageView of this page. */
function onConsentChange(): void {
  if (!marketingGranted()) return;
  syncFbcCookie();
  enablePixel();
  track('page_view');
}

/**
 * Starts tracking on a page. Called once by the base layout on every page. Keeps the campaign parameters of the landing and,
 * when marketing is granted, writes the click cookie, loads the Pixel and sends the PageView. The Pixel id and the currency
 * come from data attributes that the server puts on <body>.
 */
export function initTracking(): void {
  try {
    const dataset = document.body.dataset;
    const pixelId = (dataset.metaPixelId ?? '').trim();
    if (/^\d{1,20}$/.test(pixelId)) {
      const currency = dataset.currency ?? '';
      config = { pixelId, currency: isCurrencyCode(currency) ? currency : 'USD' };
    }
    captureAttribution(location.search);
    if (marketingGranted()) syncFbcCookie();
    window.addEventListener(CONSENT_CHANGE_EVENT, onConsentChange);
    track('page_view');
  } catch {
    // Tracking must never break the page.
  }
}
