// Invoice rules: numbering format and when an invoice may be voided. Invoices are never deleted.
import type { OrderStatus } from '../ordering/order-status';

/** Invoice lifecycle. "void" keeps the record and marks it cancelled (no deletion ever). */
export type InvoiceStatus = 'issued' | 'void';

/** Digits used for the consecutive number part. */
const NUMBER_DIGITS = 6;

/**
 * Formats an invoice number, for example "FV-000123".
 * @param series Series prefix from settings.
 * @param number Consecutive number (at least 1).
 * @returns Printed invoice number.
 */
export function formatInvoiceNumber(series: string, number: number): string {
  return `${series}-${String(number).padStart(NUMBER_DIGITS, '0')}`;
}

/**
 * True when an invoice may be voided: it must be issued and the order must be cancelled or refunded.
 * @param invoiceStatus Current invoice status.
 * @param orderStatus Status of the order the invoice belongs to.
 * @returns Whether the void action is allowed.
 */
export function canVoidInvoice(invoiceStatus: InvoiceStatus, orderStatus: OrderStatus): boolean {
  return invoiceStatus === 'issued' && (orderStatus === 'cancelled' || orderStatus === 'refunded');
}
