// VoidInvoice: marks an issued invoice as void. The record stays; the next download is rendered with the void mark.
// Only owners may void, because a void changes what the customer and the books see.
import { can } from '@/domain/identity/role';
import { canVoidInvoice } from '@/domain/invoicing/invoice';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../ports/identity';
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
   * @param actor The signed-in admin. Only roles with the invoices.void permission may void.
   * @param invoiceId Invoice id.
   * @param reason Why the invoice is void. Kept on the record.
   * @throws DomainError FORBIDDEN for non-owners, NOT_FOUND or INVALID_STATE when the invoice cannot be voided.
   */
  async execute(actor: AdminUser, invoiceId: string, reason: string): Promise<void> {
    // The permission is checked before any lookup, so an editor cannot probe which invoice ids exist.
    if (!can(actor.role, 'invoices.void'))
      throw new DomainError('FORBIDDEN', 'Only owners can void invoices');
    const invoice = await this.deps.invoices.findById(invoiceId);
    if (!invoice) throw new DomainError('NOT_FOUND', 'Invoice not found');
    const order = await this.deps.orders.findById(invoice.orderId);
    if (!order || !canVoidInvoice(invoice.status, order.status)) {
      throw new DomainError('INVALID_STATE', 'This invoice cannot be voided');
    }
    await this.deps.invoices.void(invoiceId, reason, this.deps.clock.now().toISOString());
  }
}
