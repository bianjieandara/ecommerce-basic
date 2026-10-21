// Invoicing adapters. The PDF renderer uses Browser Run; the legal issuer is a no-op until a certified provider exists.
import type { LegalInvoiceIssuer, LegalResult, PdfRenderer } from '@/application/ports/invoicing';

/** Used when the BROWSER binding is missing. The invoice still exists; only the PDF is skipped. */
export class NullPdfRenderer implements PdfRenderer {
  readonly available = false;

  async render(): Promise<ArrayBuffer> {
    throw new Error('PDF rendering is not available (no BROWSER binding)');
  }
}

/** Renders invoice HTML to PDF with the Browser Run quick action `pdf` (A4, backgrounds on). */
export class BrowserRunPdfRenderer implements PdfRenderer {
  readonly available = true;

  /** @param browser The BROWSER binding. */
  constructor(private readonly browser: BrowserRun) {}

  async render(html: string): Promise<ArrayBuffer> {
    const options: BrowserRunPDFOptions = { html, pdfOptions: { format: 'a4', printBackground: true } };
    const response = await this.browser.quickAction('pdf', options);
    return response.arrayBuffer();
  }
}

/** Default legal issuer: the store issues its own invoice, with no certified e-invoice. */
export class NoopLegalInvoiceIssuer implements LegalInvoiceIssuer {
  readonly provider = 'none';

  isEnabled(): boolean {
    return false;
  }

  async issue(): Promise<LegalResult> {
    return { provider: this.provider, reference: null, status: 'not_applicable', message: null };
  }
}
