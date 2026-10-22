// RenderInvoicePdf: turns an issued invoice into a PDF, stores it in R2 and then emails it to the customer. It is the
// invoice.render_pdf job. A repeat finds the PDF already stored and sends the email only if it was not queued yet.
import { renderInvoiceHtml } from '../documents/invoice-document';
import { invoiceDocumentOptions } from './invoice-options';
import type { SettingsRepository } from '../ports/content';
import type { Invoice, InvoiceRepository, PdfRenderer } from '../ports/invoicing';
import type { MediaStorage } from '../ports/media';
import type { OrderRepository } from '../ports/ordering';
import type { Clock } from '../ports/platform';
import type { NotificationService } from '../notifications/notification-service';
import type { OrderLinks } from '../ordering/order-links';
import { queueInvoiceEmail } from './invoice-email';

/**
 * Storage key of an invoice's PDF.
 * @param invoiceId Invoice id.
 * @returns R2 object key.
 */
export function invoicePdfKey(invoiceId: string): string {
  return `invoices/${invoiceId}.pdf`;
}

/** Dependencies of PDF rendering and storage. */
export interface PdfStoreDeps {
  invoices: InvoiceRepository;
  settings: SettingsRepository;
  pdf: PdfRenderer;
  media: MediaStorage;
  clock: Clock;
}

/**
 * Renders an invoice to PDF, stores it and records the key on the invoice.
 * @param deps Repositories, the renderer and the storage.
 * @param invoice The invoice to render.
 * @returns The PDF bytes.
 * @throws when the renderer fails. The caller decides whether that is retried.
 */
export async function storePdf(deps: PdfStoreDeps, invoice: Invoice): Promise<ArrayBuffer> {
  // The same options the customer page uses, so the stored PDF and the page show the same store details.
  const html = renderInvoiceHtml(invoice, await invoiceDocumentOptions(deps.settings, invoice));
  const bytes = await deps.pdf.render(html);
  const key = invoicePdfKey(invoice.id);
  await deps.media.put(key, bytes, 'application/pdf');
  await deps.invoices.setPdfKey(invoice.id, key, deps.clock.now().toISOString());
  return bytes;
}

/** Dependencies of RenderInvoicePdf. */
export interface RenderInvoicePdfDeps extends PdfStoreDeps {
  orders: OrderRepository;
  notifications: NotificationService;
  links: OrderLinks;
  siteUrl: string;
}

/** Renders invoices and tells the customer about them. */
export class RenderInvoicePdf {
  /** @param deps Storage, orders and notifications. */
  constructor(private readonly deps: RenderInvoicePdfDeps) {}

  /**
   * Renders the PDF of an invoice that has none yet, then queues the customer email. The email does not depend on who
   * stored the PDF: a customer's download can store it before this job runs, and the email must still go out. Repeats are
   * safe because the notification key is built from the invoice, so a second run queues nothing.
   * @param invoiceId Invoice id.
   * @param regenerate Renders again even when a PDF is stored, for an admin who asks for a fresh copy.
   */
  async execute(invoiceId: string, regenerate = false): Promise<void> {
    const invoice = await this.deps.invoices.findById(invoiceId);
    if (!invoice) return;
    if (regenerate || !invoice.pdfKey) await storePdf(this.deps, invoice);
    // A voided invoice is not announced as a new invoice.
    if (invoice.status === 'issued') await this.notifyCustomer(invoice);
  }

  /**
   * Queues the invoice email, with the PDF attached when the store sends PDFs by email.
   * @param invoice The invoice that was just rendered.
   */
  private async notifyCustomer(invoice: Invoice): Promise<void> {
    const order = await this.deps.orders.findById(invoice.orderId);
    if (!order) return;
    await queueInvoiceEmail(this.deps, order, invoice, invoice.id);
  }
}
