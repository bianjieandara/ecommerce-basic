// RegenerateInvoicePdf: an owner or editor asks for a fresh PDF of an invoice, for example after the store's details changed. The
// render runs in the invoice.render_pdf job, which replaces the stored file. A repeat does not send the customer a second email.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../ports/identity';
import type { InvoiceRepository } from '../ports/invoicing';
import type { JobQueue } from '../ports/jobs';
import type { Clock } from '../ports/platform';

/** Dependencies of RegenerateInvoicePdf. */
export interface RegenerateInvoicePdfDeps {
  invoices: InvoiceRepository;
  jobs: JobQueue;
  clock: Clock;
}

/** Queues a fresh PDF of an invoice from the admin screens. */
export class RegenerateInvoicePdf {
  /** @param deps The invoice lookup, the job queue and the clock. */
  constructor(private readonly deps: RegenerateInvoicePdfDeps) {}

  /**
   * Queues the render. Each request gets its own job, so asking twice renders twice; the stored file is replaced either way.
   * @param actor Signed-in admin. Owners and editors both change orders, so both may ask for a new PDF.
   * @param invoiceId Invoice id.
   * @throws DomainError FORBIDDEN or NOT_FOUND.
   */
  async execute(actor: AdminUser, invoiceId: string): Promise<void> {
    if (!can(actor.role, 'orders.manage')) throw new DomainError('FORBIDDEN', 'You cannot change orders');
    const invoice = await this.deps.invoices.findById(invoiceId);
    if (!invoice) throw new DomainError('NOT_FOUND', 'Invoice not found');
    await this.deps.jobs.enqueue(
      'invoice.render_pdf',
      { invoiceId: invoice.id, regenerate: true },
      { idempotencyKey: `invoice-pdf:${invoice.id}:regenerate:${this.deps.clock.now().toISOString()}` },
    );
  }
}
