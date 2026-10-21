// Email attachments for invoices. The bytes are read from R2 when the email is sent, so a queued message never holds a PDF.
import { formatInvoiceNumber } from '@/domain/invoicing/invoice';
import type { EmailAttachment } from '@/application/ports/platform';
import type { AttachmentLoader, EmailAttachmentRef } from '@/application/ports/notifications';
import type { InvoiceRepository } from '@/application/ports/invoicing';
import type { MediaStorage } from '@/application/ports/media';

/** Turns invoice references into PDF attachments, reading the stored files. */
export class InvoiceAttachments implements AttachmentLoader {
  /**
   * @param invoices Invoice repository.
   * @param media R2 storage where the PDFs are kept.
   */
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly media: MediaStorage,
  ) {}

  /**
   * Loads the files behind the references. A reference without a stored PDF is left out, so the email still goes out.
   * @param refs Attachment references from the queued message.
   * @returns The files that exist.
   */
  async load(refs: EmailAttachmentRef[]): Promise<EmailAttachment[]> {
    const files: EmailAttachment[] = [];
    for (const ref of refs) {
      const invoice = await this.invoices.findById(ref.invoiceId);
      const content = invoice?.pdfKey ? await this.media.getBytes(invoice.pdfKey) : null;
      if (!invoice || !content) continue;
      files.push({
        filename: `${formatInvoiceNumber(invoice.series, invoice.number)}.pdf`,
        contentType: 'application/pdf',
        content,
      });
    }
    return files;
  }
}
