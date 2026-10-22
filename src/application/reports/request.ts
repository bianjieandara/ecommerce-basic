// The query string of a report page or CSV link, read into plain values. Days are validated and defaulted by the use case, once
// the store's clock and time zone are known; this module only keeps the text apart from the URL.
/** Raw report parameters, as the URL gives them. Missing values are null. */
export interface ReportRequest {
  from: string | null;
  to: string | null;
  grain: string | null;
  category: string | null;
  series: string | null;
  /** Which table a CSV link exports; null for the first one. */
  table: string | null;
}

/** Longest value kept for a category id or a series code. */
const MAX_FILTER_TEXT = 64;

/**
 * Reads the report parameters from a query string.
 * @param params Query string of the page or of the CSV link.
 * @returns The raw parameters, trimmed and length-limited.
 */
export function reportRequestFrom(params: URLSearchParams): ReportRequest {
  const text = (name: string): string | null => {
    const value = (params.get(name) ?? '').trim().slice(0, MAX_FILTER_TEXT);
    return value === '' ? null : value;
  };
  return {
    from: text('from'),
    to: text('to'),
    grain: text('grain'),
    category: text('category'),
    series: text('series'),
    table: text('table'),
  };
}
