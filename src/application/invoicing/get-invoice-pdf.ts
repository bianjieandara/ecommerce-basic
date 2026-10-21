// GetInvoicePdf: the customer's PDF download. The order access key must match. The stored PDF is returned; when there is
// none (after a void, or a render that failed), it is produced now.
import { formatInvoiceNumber } from '@/domain/invoicing/invoice';
import type { InvoiceRepository } from '../ports/invoicing';
import type { MediaStorage } from '../ports/media';
import type { GetOrderStatus } from '../ordering/get-order-status';
import { storePdf, type PdfStoreDeps } from './render-invoice-pdf';

/** A PDF ready to send to the customer. */
export interface InvoicePdfFile {
  filename: string;
  bytes: ArrayBuffer;
}

/** Dependencies of GetInvoicePdf. */
export interface GetInvoicePdfDeps extends PdfStoreDeps {
  orderStatus: GetOrderStatus;
  invoices: InvoiceRepository;
  media: MediaStorage;
}

/** Serves invoice PDFs to the customers who own them. */
export class GetInvoicePdf {
  /** @param deps Order access check, invoice storage and the PDF pipeline. */
  constructor(private readonly deps: GetInvoicePdfDeps) {}

  /**
   * Returns the invoice PDF of an order, when the access key is right.
   * @param number Order number.
   * @param key Order access key.
   * @returns The file, or null when the key is wrong or the order has no invoice.
   */
  async execute(number: number, key: string): Promise<InvoicePdfFile | null> {
    const view = await this.deps.orderStatus.execute(number, key);
    if (!view) return null;
    const invoice = await this.deps.invoices.findByOrderId(view.order.id);
    if (!invoice) return null;
    const filename = `${formatInvoiceNumber(invoice.series, invoice.number)}.pdf`;
    if (invoice.pdfKey) {
      const stored = await this.deps.media.getBytes(invoice.pdfKey);
      if (stored) return { filename, bytes: stored };
    }
    return { filename, bytes: await storePdf(this.deps, invoice) };
  }
}
