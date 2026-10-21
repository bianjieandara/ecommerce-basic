// Invoicing ports: our own consecutive invoice, the PDF renderer, and the legal e-invoicing hook.
import type { InvoiceStatus } from '@/domain/invoicing/invoice';
import type { TaxBreakdownRow } from '@/domain/ordering/tax';
import type { CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';

/** Seller data copied onto each invoice. */
export interface InvoiceSeller {
  legalName: string;
  taxId: string;
  taxIdType: string;
  taxRegime: string;
  address: string;
  phone: string;
  email: string;
}

/** Buyer data copied onto each invoice. */
export interface InvoiceBuyer {
  name: string;
  email: string;
  phone: string;
  taxId: string | null;
  legalName: string | null;
  address: Record<string, string>;
}

/** One invoice line, copied from the order item. */
export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxRateBp: number;
  taxMinor: number;
  lineTotalMinor: number;
}

/** Result of the legal e-invoicing hook. */
export type LegalStatus = 'not_applicable' | 'pending' | 'accepted' | 'rejected';

/** Legal e-invoicing outcome to store on the invoice. */
export interface LegalResult {
  provider: string;
  reference: string | null;
  status: LegalStatus;
  message: string | null;
}

/** An invoice as stored. Every field is a snapshot. */
export interface Invoice {
  id: string;
  orderId: string;
  orderNumber: number;
  series: string;
  number: number;
  status: InvoiceStatus;
  currency: CurrencyCode;
  locale: Locale;
  pricesIncludeTax: boolean;
  subtotalMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
  lines: InvoiceLine[];
  taxBreakdown: TaxBreakdownRow[];
  pdfKey: string | null;
  legal: LegalResult | null;
  voidReason: string | null;
  issuedAt: string;
}

/** Data needed to insert an invoice (the number is assigned by the repository). */
export interface NewInvoice extends Omit<
  Invoice,
  'id' | 'number' | 'status' | 'pdfKey' | 'legal' | 'voidReason' | 'orderNumber'
> {
  id: string;
  issuedAt: string;
}

/** Persistence for invoices and their series counters. */
export interface InvoiceRepository {
  /** Assigns the next number in the series and inserts the invoice in one batch. CONFLICT when the order already has one. */
  issue(draft: NewInvoice): Promise<Invoice>;
  findById(id: string): Promise<Invoice | null>;
  findByOrderId(orderId: string): Promise<Invoice | null>;
  setPdfKey(id: string, key: string): Promise<void>;
  setLegalResult(id: string, result: LegalResult): Promise<void>;
  void(id: string, reason: string, nowIso: string): Promise<void>;
}

/** Turns invoice HTML into a PDF. */
export interface PdfRenderer {
  readonly available: boolean;
  render(html: string): Promise<ArrayBuffer>;
}

/** Legal e-invoicing hook. The default adapter does nothing; a certified provider plugs in here per country. */
export interface LegalInvoiceIssuer {
  readonly provider: string;
  isEnabled(): boolean;
  issue(invoice: Invoice): Promise<LegalResult>;
}
