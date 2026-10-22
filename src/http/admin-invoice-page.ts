// Filters of the invoice list, read from the query string. The list and its CSV export read them here, so a filtered view and the
// file exported from it always agree.
import type { AdminInvoiceFilter } from '@/application/ports/invoice-admin';
import { INVOICE_STATUSES, type InvoiceStatus } from '@/domain/invoicing/invoice';
import { dayRangeBounds } from './store-days';

/**
 * Reads the invoice list filters. Unknown values fall back to "everything"; days follow the store's clock.
 * @param params Query string of the page or of the export.
 * @param timeZone The store's time zone.
 * @returns The filters.
 */
export function invoiceFilterFrom(params: URLSearchParams, timeZone: string): AdminInvoiceFilter {
  const statusParam = params.get('status') ?? '';
  const status = (INVOICE_STATUSES as readonly string[]).includes(statusParam)
    ? (statusParam as InvoiceStatus)
    : null;
  const bounds = dayRangeBounds(params.get('from'), params.get('to'), timeZone);
  return {
    status,
    series: (params.get('series') ?? '').trim().slice(0, 10) || null,
    from: bounds.from,
    to: bounds.to,
    search: (params.get('q') ?? '').trim().slice(0, 80) || null,
  };
}
