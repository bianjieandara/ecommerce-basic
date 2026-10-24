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
  /** Where an image is served: the Worker's /media route, or `base` (from `normalizeMediaBase`) when images have their own host. */
  media: (key: string, base = '') => (base === '' ? `/media/${key}` : `${base}/${key}`),
} as const;

/**
 * Admin pages. Notifications link to some of them, and the middleware guards all of them. The admin UI follows each
 * admin's own locale (the `admin` dictionary), so these paths carry no language prefix.
 */
export const ADMIN_PATHS = {
  dashboard: '/admin',
  setup: '/admin/setup',
  login: '/admin/login',
  forgotPassword: '/admin/forgot-password',
  resetPassword: '/admin/reset-password',
  acceptInvite: '/admin/accept-invite',
  reports: '/admin/reports',
  whatsapp: '/admin/whatsapp',
  products: '/admin/products',
  categories: '/admin/categories',
  attributes: '/admin/attributes',
  media: '/admin/media',
  inventory: '/admin/inventory',
  inventoryMovements: '/admin/inventory/movements',
  orders: '/admin/orders',
  invoices: '/admin/invoices',
  notificationLog: '/admin/notification-log',
  jobs: '/admin/jobs',
  settings: '/admin/settings',
  pages: '/admin/pages',
  emails: '/admin/emails',
  shipping: '/admin/shipping',
  testimonials: '/admin/testimonials',
  users: '/admin/users',
} as const;
