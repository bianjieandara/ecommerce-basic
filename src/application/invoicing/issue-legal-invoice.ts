// IssueLegalInvoice: sends the invoice to a legal e-invoicing provider, when one is configured for the store. The default
// adapter does nothing. This is the invoice.legal_issue job.
import type { InvoiceRepository, LegalInvoiceIssuer } from '../ports/invoicing';
import type { Clock } from '../ports/platform';

/** Dependencies of IssueLegalInvoice. */
export interface IssueLegalInvoiceDeps {
  invoices: InvoiceRepository;
  legal: LegalInvoiceIssuer;
  clock: Clock;
}

/** Runs the legal e-invoicing hook for one invoice. */
export class IssueLegalInvoice {
  /** @param deps Repositories, the legal issuer and the clock. */
  constructor(private readonly deps: IssueLegalInvoiceDeps) {}

  /**
   * Submits an invoice to the legal provider and stores the answer. Invoices that already have an answer are skipped.
   * @param invoiceId Invoice id.
   */
  async execute(invoiceId: string): Promise<void> {
    const invoice = await this.deps.invoices.findById(invoiceId);
    if (!invoice || invoice.legal || !this.deps.legal.isEnabled()) return;
    const result = await this.deps.legal.issue(invoice);
    await this.deps.invoices.setLegalResult(invoiceId, result, this.deps.clock.now().toISOString());
  }
}
