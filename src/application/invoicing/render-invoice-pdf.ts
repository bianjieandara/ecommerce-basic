// RenderInvoicePdf: turns an issued invoice into a PDF, stores it in R2 and then emails it to the customer. It is the
// invoice.render_pdf job. A repeat finds the PDF already stored and sends the email only if it was not queued yet.
import { formatInvoiceNumber } from '@/domain/invoicing/invoice';
import { pickText } from '@/domain/shared/localized-text';
import { renderInvoiceHtml } from '../documents/invoice-document';
import type { SettingsRepository } from '../ports/content';
import type { Invoice, InvoiceRepository, PdfRenderer } from '../ports/invoicing';
import type { MediaStorage } from '../ports/media';
import type { OrderRepository } from '../ports/ordering';
import type { Clock } from '../ports/platform';
import type { NotificationService } from '../notifications/notification-service';
import type { OrderLinks } from '../ordering/order-links';
import { loadOrderPresentation, orderSections } from '../ordering/order-sections';

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
  const [general, theme, invoicing] = await Promise.all([
    deps.settings.get('general'),
    deps.settings.get('theme'),
    deps.settings.get('invoicing'),
  ]);
  const html = renderInvoiceHtml(invoice, {
    storeName: general.storeName,
    country: general.country,
    timeZone: general.timezone,
    primaryColor: theme.colorPrimary,
    footerNotes: pickText(invoicing.footerNotes, invoice.locale, 'es'),
  });
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
   */
  async execute(invoiceId: string): Promise<void> {
    const invoice = await this.deps.invoices.findById(invoiceId);
    if (!invoice) return;
    if (!invoice.pdfKey) await storePdf(this.deps, invoice);
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
    const invoicing = await this.deps.settings.get('invoicing');
    await this.deps.notifications.notify({
      key: 'invoice_issued',
      reference: invoice.id,
      orderId: order.id,
      recipient: { email: order.customer.email, locale: order.locale },
      context: {
        ...orderSections(order, order.locale, {
          siteUrl: this.deps.siteUrl,
          presentation: await loadOrderPresentation(this.deps.settings),
          accessKey: await this.deps.links.keyFor(order),
        }),
        invoice: { number: formatInvoiceNumber(invoice.series, invoice.number), url: '' },
      },
      attachments: invoicing.attachPdf ? [{ kind: 'invoice_pdf', invoiceId: invoice.id }] : [],
    });
  }
}
