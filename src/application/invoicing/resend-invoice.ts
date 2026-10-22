// ResendInvoice: sends the invoice e-mail again, for example when the customer lost the first one. Only issued invoices are sent.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../ports/identity';
import type { InvoiceRepository } from '../ports/invoicing';
import type { OrderRepository } from '../ports/ordering';
import type { Clock } from '../ports/platform';
import { queueInvoiceEmail, type InvoiceEmailDeps } from './invoice-email';

/** Dependencies of ResendInvoice. */
export interface ResendInvoiceDeps extends InvoiceEmailDeps {
  invoices: InvoiceRepository;
  orders: OrderRepository;
  clock: Clock;
}

/** Sends an issued invoice to the customer again. */
export class ResendInvoice {
  /** @param deps Repositories, the e-mail helpers and the clock. */
  constructor(private readonly deps: ResendInvoiceDeps) {}

  /**
   * Queues the invoice e-mail once more.
   * @param actor Signed-in admin. Editors and owners may resend.
   * @param invoiceId Invoice id.
   * @throws DomainError FORBIDDEN, NOT_FOUND, or INVALID_STATE for a voided invoice.
   */
  async execute(actor: AdminUser, invoiceId: string): Promise<void> {
    if (!can(actor.role, 'orders.manage')) throw new DomainError('FORBIDDEN', 'You cannot send invoices');
    const invoice = await this.deps.invoices.findById(invoiceId);
    if (!invoice) throw new DomainError('NOT_FOUND', 'Invoice not found');
    if (invoice.status !== 'issued') {
      throw new DomainError('INVALID_STATE', 'Only issued invoices can be sent again');
    }
    const order = await this.deps.orders.findById(invoice.orderId);
    if (!order) throw new DomainError('NOT_FOUND', 'Order not found');
    // A resend is a new message, so its reference carries the time of this request.
    await queueInvoiceEmail(
      this.deps,
      order,
      invoice,
      `${invoice.id}:resend:${this.deps.clock.now().toISOString()}`,
    );
  }
}
