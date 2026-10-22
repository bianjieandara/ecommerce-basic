// Admin reads of orders for the order list. Read-only: every change goes through the ordering use cases.
import type { CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';
import type { OrderStatus } from '@/domain/ordering/order-status';
import type { PaymentMethod } from './payments';

/** Filters of the admin order list. Dates are instants: the caller converts store-local days first. */
export interface AdminOrderFilter {
  status: OrderStatus | null;
  paymentMethod: PaymentMethod | null;
  /** Inclusive lower bound on the order's creation time, or null. */
  from: string | null;
  /** Exclusive upper bound on the order's creation time, or null. */
  to: string | null;
  /** An order number when the text is digits; otherwise a part of the name, e-mail or phone. */
  search: string | null;
}

/** One row of the order list. */
export interface AdminOrderRow {
  id: string;
  number: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerEmail: string;
  totalMinor: number;
  currency: CurrencyCode;
  locale: Locale;
  createdAt: string;
}

/** Reads for the admin order list. */
export interface AdminOrderQueries {
  /** One page, newest first, and the number of orders the filter matches. */
  list(
    filter: AdminOrderFilter,
    page: number,
    pageSize: number,
  ): Promise<{ items: AdminOrderRow[]; total: number }>;
}
