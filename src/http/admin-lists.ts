// Shared settings of the paged admin lists. Every list pages the same way, so the page size lives in one place.

/** Rows per page on the admin lists (orders, invoices, messages, the message log and failed jobs). */
export const ADMIN_LIST_PAGE_SIZE = 25;

/** Most rows one CSV export writes. A screen says so when its filter matches more. */
export const EXPORT_ROW_LIMIT = 5000;
