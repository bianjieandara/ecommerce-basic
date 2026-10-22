// Admin reads of invoices for the invoice list and its period totals. Read-only: changes go through the invoicing use cases.
import type { InvoiceStatus } from '@/domain/invoicing/invoice';
import type { CurrencyCode } from '@/domain/shared/currency';

/** Filters of the admin invoice list. Dates are instants: the caller converts store-local days first. */
export interface AdminInvoiceFilter {
  status: InvoiceStatus | null;
  series: string | null;
  /** Inclusive lower bound on the issue time, or null. */
  from: string | null;
  /** Exclusive upper bound on the issue time, or null. */
  to: string | null;
  /** Digits match the invoice or order number; other text matches the buyer's name or e-mail. */
  search: string | null;
}

/** One row of the invoice list. */
export interface AdminInvoiceRow {
  id: string;
  series: string;
  number: number;
  orderNumber: number;
  status: InvoiceStatus;
  buyerName: string;
  totalMinor: number;
  taxMinor: number;
  currency: CurrencyCode;
  issuedAt: string;
  voidReason: string | null;
}

/** Totals over the issued invoices the filter matches (voided ones are not counted). */
export interface AdminInvoiceTotals {
  issued: number;
  totalMinor: number;
  taxMinor: number;
}

/** Reads for the admin invoice list. */
export interface AdminInvoiceQueries {
  list(
    filter: AdminInvoiceFilter,
    page: number,
    pageSize: number,
  ): Promise<{ items: AdminInvoiceRow[]; total: number; totals: AdminInvoiceTotals }>;
}
