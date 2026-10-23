// The admin menu: the pages grouped in five sections. One list feeds the mega menu, the search box and the breadcrumb of every
// admin page, so a new page is added here once. Labels are dictionary keys, translated where they are drawn.
import { ADMIN_PATHS } from '@/domain/shared/paths';
import type { DotPath } from '@/ui/i18n';

/** One page of the admin menu. */
export interface AdminNavItem {
  href: string;
  /** Dictionary key of the page's name. */
  label: DotPath;
}

/** A section of the menu. */
export interface AdminNavGroup {
  /** Dictionary key of the section's name. */
  label: DotPath;
  items: AdminNavItem[];
}

/** The menu, in the order it is shown. */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: 'admin.nav.groups.catalog',
    items: [
      { href: ADMIN_PATHS.products, label: 'admin.nav.products' },
      { href: ADMIN_PATHS.categories, label: 'admin.nav.categories' },
      { href: ADMIN_PATHS.attributes, label: 'admin.nav.attributes' },
      { href: ADMIN_PATHS.media, label: 'admin.nav.media' },
      { href: ADMIN_PATHS.inventory, label: 'admin.nav.inventory' },
    ],
  },
  {
    label: 'admin.nav.groups.sales',
    items: [
      { href: ADMIN_PATHS.orders, label: 'admin.nav.orders' },
      { href: ADMIN_PATHS.invoices, label: 'admin.nav.invoices' },
      { href: ADMIN_PATHS.shipping, label: 'admin.nav.shipping' },
      { href: ADMIN_PATHS.reports, label: 'admin.reports.title' },
    ],
  },
  {
    label: 'admin.nav.groups.content',
    items: [
      { href: ADMIN_PATHS.pages, label: 'admin.nav.pages' },
      { href: ADMIN_PATHS.testimonials, label: 'admin.nav.testimonials' },
      { href: ADMIN_PATHS.emails, label: 'admin.nav.emails' },
    ],
  },
  {
    label: 'admin.nav.groups.messaging',
    items: [
      { href: ADMIN_PATHS.whatsapp, label: 'admin.nav.whatsapp' },
      { href: ADMIN_PATHS.notificationLog, label: 'admin.nav.notifications' },
      { href: ADMIN_PATHS.jobs, label: 'admin.nav.jobs' },
    ],
  },
  {
    label: 'admin.nav.groups.store',
    items: [
      { href: ADMIN_PATHS.settings, label: 'admin.nav.settings' },
      { href: ADMIN_PATHS.users, label: 'admin.nav.users' },
    ],
  },
];

/**
 * Finds the menu page and section a path belongs to. A page below another (a product, an order) belongs to the page above it.
 * @param pathname Path of the current request.
 * @returns The group and item, or null for pages outside the menu (the dashboard).
 */
export function findAdminNav(pathname: string): { group: AdminNavGroup; item: AdminNavItem } | null {
  const path = pathname.replace(/\/+$/, '');
  let best: { group: AdminNavGroup; item: AdminNavItem } | null = null;
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      const matches = path === item.href || path.startsWith(`${item.href}/`);
      // The longest match wins, so /admin/inventory/movements belongs to inventory and not to a shorter prefix.
      if (matches && (!best || item.href.length > best.item.href.length)) best = { group, item };
    }
  }
  return best;
}
