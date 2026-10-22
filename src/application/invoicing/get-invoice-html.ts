// GetInvoiceHtml: the customer's invoice as an HTML page. It is the document the PDF is rendered from, so the page and the
// PDF show the same invoice. The order access key must match, as it does for the PDF download.
import { renderInvoiceHtml } from '../documents/invoice-document';
import type { GetOrderStatus } from '../ordering/get-order-status';
import type { SettingsRepository } from '../ports/content';
import type { InvoiceRepository } from '../ports/invoicing';
import { invoiceDocumentOptions } from './invoice-options';

/** Dependencies of GetInvoiceHtml. */
export interface GetInvoiceHtmlDeps {
  orderStatus: GetOrderStatus;
  invoices: InvoiceRepository;
  settings: SettingsRepository;
}

/** Serves invoice pages to the customers who own them. */
export class GetInvoiceHtml {
  /** @param deps Order access check, invoice lookup and store settings. */
  constructor(private readonly deps: GetInvoiceHtmlDeps) {}

  /**
   * Returns the invoice of an order as an HTML document, when the access key is right. A void invoice is still returned:
   * its document carries the VOID mark, which is how the customer learns that the invoice was cancelled.
   * @param number Order number.
   * @param key Order access key.
   * @returns The HTML document, or null when the key is wrong or the order has no invoice.
   */
  async execute(number: number, key: string): Promise<string | null> {
    const view = await this.deps.orderStatus.execute(number, key);
    if (!view) return null;
    const invoice = await this.deps.invoices.findByOrderId(view.order.id);
    if (!invoice) return null;
    return renderInvoiceHtml(invoice, await invoiceDocumentOptions(this.deps.settings, invoice));
  }
}
