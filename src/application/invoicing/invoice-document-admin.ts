// InvoiceDocumentForAdmin: the invoice as the store's HTML document, for the admin screen. It is the same document the customer page
// and the PDF show, so the owner sees what the customer gets.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import { renderInvoiceHtml } from '../documents/invoice-document';
import type { SettingsRepository } from '../ports/content';
import type { AdminUser } from '../ports/identity';
import type { InvoiceRepository } from '../ports/invoicing';
import { invoiceDocumentOptions } from './invoice-options';

/** Dependencies of InvoiceDocumentForAdmin. */
export interface InvoiceDocumentForAdminDeps {
  invoices: InvoiceRepository;
  settings: SettingsRepository;
}

/** Renders an invoice for the admin screen. */
export class InvoiceDocumentForAdmin {
  /** @param deps Invoice lookup and store settings. */
  constructor(private readonly deps: InvoiceDocumentForAdminDeps) {}

  /**
   * @param actor Signed-in admin. Editors and owners may view invoices.
   * @param invoiceId Invoice id.
   * @returns The HTML document, or null when the invoice does not exist.
   * @throws DomainError FORBIDDEN for an admin without the permission.
   */
  async execute(actor: AdminUser, invoiceId: string): Promise<string | null> {
    if (!can(actor.role, 'orders.manage')) throw new DomainError('FORBIDDEN', 'You cannot view invoices');
    const invoice = await this.deps.invoices.findById(invoiceId);
    if (!invoice) return null;
    return renderInvoiceHtml(invoice, await invoiceDocumentOptions(this.deps.settings, invoice));
  }
}
