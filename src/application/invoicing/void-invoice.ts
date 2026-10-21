// VoidInvoice: marks an issued invoice as void. The record stays; the next download is rendered with the void mark.
import { canVoidInvoice } from '@/domain/invoicing/invoice';
import { DomainError } from '@/domain/shared/errors';
import type { InvoiceRepository } from '../ports/invoicing';
import type { OrderRepository } from '../ports/ordering';
import type { Clock } from '../ports/platform';

/** Dependencies of VoidInvoice. */
export interface VoidInvoiceDeps {
  invoices: InvoiceRepository;
  orders: OrderRepository;
  clock: Clock;
}

/** Voids invoices of cancelled or refunded orders. */
export class VoidInvoice {
  /** @param deps Repositories and the clock. */
  constructor(private readonly deps: VoidInvoiceDeps) {}

  /**
   * Voids an invoice.
   * @param invoiceId Invoice id.
   * @param reason Why the invoice is void. Kept on the record.
   * @throws DomainError NOT_FOUND or INVALID_STATE when the invoice cannot be voided.
   */
  async execute(invoiceId: string, reason: string): Promise<void> {
    const invoice = await this.deps.invoices.findById(invoiceId);
    if (!invoice) throw new DomainError('NOT_FOUND', 'Invoice not found');
    const order = await this.deps.orders.findById(invoice.orderId);
    if (!order || !canVoidInvoice(invoice.status, order.status)) {
      throw new DomainError('INVALID_STATE', 'This invoice cannot be voided');
    }
    await this.deps.invoices.void(invoiceId, reason, this.deps.clock.now().toISOString());
  }
}
