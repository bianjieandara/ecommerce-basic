// Page-based pagination shared by catalog, orders, messages and admin lists.

/** Requested page and size. Pages start at 1. */
export interface PageQuery {
  page: number;
  pageSize: number;
}

/** One page of results plus the totals needed to render pagination controls. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Computes the number of pages for a total (always at least 1, so empty lists still render page 1).
 * @param total Number of matching rows.
 * @param pageSize Rows per page (at least 1).
 * @returns Page count.
 */
export function totalPagesFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/**
 * Wraps one page of items with its pagination metadata.
 * @param items Rows of the requested page.
 * @param total Total matching rows across all pages.
 * @param query Requested page and size.
 * @returns The paginated result.
 */
export function toPaginated<T>(items: T[], total: number, query: PageQuery): Paginated<T> {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: totalPagesFor(total, query.pageSize),
  };
}
