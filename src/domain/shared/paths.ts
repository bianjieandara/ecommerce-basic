// Public URL patterns. This is the only place that defines them; UI links (relative) and absolute URLs
// for emails, sitemaps and PDFs are both built from these functions.
import type { Locale } from './locale';

/**
 * Appends query parameters to a path, skipping empty values. Keys keep the order given by the caller.
 * @param path Path without query string.
 * @param params Parameter map; `undefined` and "" values are dropped.
 * @returns Path with a query string when any value remains.
 */
export function withQuery(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Public path builders. Every argument that comes from user input must be validated before it gets here. */
export const PATHS = {
  home: (locale: Locale) => `/${locale}/`,
  shop: (locale: Locale) => `/${locale}/shop`,
  category: (locale: Locale, slug: string) => `/${locale}/shop/${slug}`,
  product: (locale: Locale, slug: string) => `/${locale}/products/${slug}`,
  page: (locale: Locale, slug: string) => `/${locale}/p/${slug}`,
  cart: (locale: Locale) => `/${locale}/cart`,
  checkout: (locale: Locale) => `/${locale}/checkout`,
  checkoutSuccess: (locale: Locale) => `/${locale}/checkout/success`,
  checkoutCancel: (locale: Locale) => `/${locale}/checkout/cancel`,
  order: (locale: Locale, number: number) => `/${locale}/orders/${number}`,
  orderInvoice: (locale: Locale, number: number) => `/${locale}/orders/${number}/invoice`,
  contact: (locale: Locale) => `/${locale}/contact`,
  media: (key: string) => `/media/${key}`,
} as const;

/** Admin paths that appear in notification links. The admin UI is not localized. */
export const ADMIN_PATHS = {
  reports: '/admin/reports',
  resetPassword: '/admin/reset-password',
  acceptInvite: '/admin/accept-invite',
} as const;
