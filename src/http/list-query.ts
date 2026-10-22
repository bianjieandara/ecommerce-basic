// Query-string helpers for the admin list pages: the page number, and links that keep the current filters.

/**
 * Parses a positive whole number from a query value.
 * @param value Raw query value.
 * @returns The number, or 1 when the value is missing or invalid.
 */
export function positiveInteger(value: string | null): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Link to a list page with the same filters and another page.
 * @param path List path.
 * @param params Current query string.
 * @param page Page to link to.
 * @returns The URL.
 */
export function listHref(path: string, params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params);
  if (page > 1) next.set('page', String(page));
  else next.delete('page');
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}
