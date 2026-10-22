// Tracked event names and the path rules that map a URL to an event. The names are shared by the database, the docs,
// the browser beacon and the Meta mapping, so they are declared once here.
import { isLocale, type Locale } from '../shared/locale';

/** Every event the store records. */
export const TRACKED_EVENT_NAMES = [
  'page_view',
  'view_item',
  'add_to_cart',
  'begin_checkout',
  'purchase',
] as const;

/** An event the store records. */
export type TrackedEventName = (typeof TRACKED_EVENT_NAMES)[number];

/**
 * Events the browser may send to POST /api/events. `page_view` and `purchase` are never accepted from the browser:
 * the server writes them, so a browser that could send them would be able to forge a purchase.
 */
export const BROWSER_EVENT_NAMES = ['view_item', 'add_to_cart', 'begin_checkout'] as const;

/** An event the browser may send. */
export type BrowserEventName = (typeof BROWSER_EVENT_NAMES)[number];

/**
 * Reads the language from a storefront path: "/es/products/x" gives "es". Admin, API and feed paths carry no
 * language prefix, so they give null and are never recorded as storefront events.
 * @param path URL path, starting with "/".
 * @returns The language, or null when the path has none.
 */
export function localeOfPath(path: string): Locale | null {
  const prefix = path.split('/')[1] ?? '';
  return isLocale(prefix) ? prefix : null;
}

/**
 * Whether a storefront path is a product page ("/es/products/slug"). Mirrors PATHS.product in domain/shared/paths.ts.
 * @param path URL path without query string.
 * @returns True for a product page.
 */
export function isProductPath(path: string): boolean {
  const parts = path.split('/');
  return parts.length === 4 && parts[2] === 'products' && (parts[3] ?? '') !== '';
}
