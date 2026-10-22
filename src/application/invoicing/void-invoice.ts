// VoidInvoice: marks an issued invoice as void. The record stays; the next download is rendered with the void mark. Only owners
// may void, and the void is written on the order timeline with the admin who did it, because it changes what the books show.
import { can } from '@/domain/identity/role';
import { canVoidInvoice } from '@/domain/invoicing/invoice';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../ports/identity';
import type { InvoiceRepository } from '../ports/invoicing';
import type { MediaStorage } from '../ports/media';
import type { OrderRepository } from '../ports/ordering';
import type { Clock, IdGenerator } from '../ports/platform';

/** Dependencies of VoidInvoice. */
export interface VoidInvoiceDeps {
  invoices: InvoiceRepository;
  orders: OrderRepository;
  clock: Clock;
  ids: IdGenerator;
  media: MediaStorage;
}

/** Voids invoices of cancelled or refunded orders. */
export class VoidInvoice {
  /** @param deps Repositories, the clock, ids for the timeline entry, and storage for the stored PDF. */
  constructor(private readonly deps: VoidInvoiceDeps) {}

  /**
   * Voids an invoice.
   * @param actor The signed-in admin. Only roles with the invoices.void permission may void.
   * @param invoiceId Invoice id.
   * @param reason Why the invoice is void. Kept on the record and on the order timeline.
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
    // The stored PDF still shows the invoice as issued, so it goes first. If this delete fails, nothing has changed yet and
    // the owner can retry. The next download renders the PDF again with the void mark.
    if (invoice.pdfKey) await this.deps.media.delete([invoice.pdfKey]);
    await this.deps.invoices.void({
      id: invoiceId,
      reason,
      actorId: actor.id,
      eventId: this.deps.ids.newId(),
      nowIso: this.deps.clock.now().toISOString(),
    });
  }
}
