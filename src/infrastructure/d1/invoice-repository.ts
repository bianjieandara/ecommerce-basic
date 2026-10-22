// Invoice persistence. The series counter and the invoice row are written in one batch, so a series never skips or repeats
// a number, even when a payment event is retried.
import type { InvoiceStatus } from '@/domain/invoicing/invoice';
import type { TaxBreakdownRow } from '@/domain/ordering/tax';
import type { CurrencyCode } from '@/domain/shared/currency';
import { DomainError } from '@/domain/shared/errors';
import type { Locale } from '@/domain/shared/locale';
import type {
  Invoice,
  InvoiceBuyer,
  InvoiceLine,
  InvoiceRepository,
  InvoiceSeller,
  LegalResult,
  LegalStatus,
  NewInvoice,
  VoidRecord,
} from '@/application/ports/invoicing';
import { boolToInt, parseJson, queryFirst, statement } from './d1-client';

/** Row shape of invoices, joined with the order number. */
interface InvoiceRow {
  id: string;
  order_id: string;
  order_number: number;
  series: string;
  number: number;
  status: InvoiceStatus;
  currency: CurrencyCode;
  locale: Locale;
  prices_include_tax: number;
  subtotal_minor: number;
  tax_minor: number;
  shipping_minor: number;
  total_minor: number;
  seller_json: string;
  buyer_json: string;
  lines_json: string;
  tax_breakdown_json: string;
  pdf_key: string | null;
  legal_provider: string | null;
  legal_reference: string | null;
  legal_status: LegalStatus;
  legal_message: string | null;
  void_reason: string | null;
  issued_at: string;
}

/** Stored seller data, used when the JSON cannot be read. */
const EMPTY_SELLER: InvoiceSeller = {
  legalName: '',
  taxId: '',
  taxIdType: '',
  taxRegime: '',
  address: '',
  phone: '',
  email: '',
};

/** Stored buyer data, used when the JSON cannot be read. */
const EMPTY_BUYER: InvoiceBuyer = {
  name: '',
  email: '',
  phone: '',
  taxId: null,
  legalName: null,
  address: {},
};

/**
 * Maps a row to the application shape.
 * @param row Joined database row.
 * @returns The invoice.
 */
function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    series: row.series,
    number: row.number,
    status: row.status,
    currency: row.currency,
    locale: row.locale,
    pricesIncludeTax: row.prices_include_tax === 1,
    subtotalMinor: row.subtotal_minor,
    taxMinor: row.tax_minor,
    shippingMinor: row.shipping_minor,
    totalMinor: row.total_minor,
    seller: parseJson<InvoiceSeller>(row.seller_json, EMPTY_SELLER),
    buyer: parseJson<InvoiceBuyer>(row.buyer_json, EMPTY_BUYER),
    lines: parseJson<InvoiceLine[]>(row.lines_json, []),
    taxBreakdown: parseJson<TaxBreakdownRow[]>(row.tax_breakdown_json, []),
    pdfKey: row.pdf_key,
    legal: row.legal_provider
      ? {
          provider: row.legal_provider,
          reference: row.legal_reference,
          status: row.legal_status,
          message: row.legal_message,
        }
      : null,
    voidReason: row.void_reason,
    issuedAt: row.issued_at,
  };
}

/** D1-backed invoice repository. */
export class D1InvoiceRepository implements InvoiceRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async issue(draft: NewInvoice): Promise<Invoice> {
    try {
      await this.db.batch([
        statement(
          this.db,
          `INSERT INTO invoice_counters (series, last_number) VALUES (?, 1)
           ON CONFLICT(series) DO UPDATE SET last_number = last_number + 1`,
          [draft.series],
        ),
        statement(
          this.db,
          `INSERT INTO invoices (id, order_id, series, number, status, currency, locale, prices_include_tax, subtotal_minor,
             tax_minor, shipping_minor, total_minor, seller_json, buyer_json, lines_json, tax_breakdown_json, pdf_key,
             legal_provider, legal_reference, legal_status, legal_message, void_reason, issued_at, updated_at)
           VALUES (?, ?, ?, (SELECT last_number FROM invoice_counters WHERE series = ?), 'issued', ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, NULL, NULL, NULL, 'not_applicable', NULL, NULL, ?, ?)`,
          [
            draft.id,
            draft.orderId,
            draft.series,
            draft.series,
            draft.currency,
            draft.locale,
            boolToInt(draft.pricesIncludeTax),
            draft.subtotalMinor,
            draft.taxMinor,
            draft.shippingMinor,
            draft.totalMinor,
            JSON.stringify(draft.seller),
            JSON.stringify(draft.buyer),
            JSON.stringify(draft.lines),
            JSON.stringify(draft.taxBreakdown),
            draft.issuedAt,
            draft.issuedAt,
          ],
        ),
      ]);
    } catch (error) {
      // The batch rolls back, so the counter does not move either.
      if (error instanceof Error && /UNIQUE constraint failed: invoices\.order_id/i.test(error.message)) {
        throw new DomainError('CONFLICT', 'The order already has an invoice');
      }
      throw error;
    }
    const invoice = await this.findById(draft.id);
    if (!invoice) throw new Error('The invoice was not stored');
    return invoice;
  }

  async findById(id: string): Promise<Invoice | null> {
    return this.load('i.id = ?', id);
  }

  async findByOrderId(orderId: string): Promise<Invoice | null> {
    return this.load('i.order_id = ?', orderId);
  }

  async setPdfKey(id: string, key: string, nowIso: string): Promise<void> {
    await statement(this.db, 'UPDATE invoices SET pdf_key = ?, updated_at = ? WHERE id = ?', [
      key,
      nowIso,
      id,
    ]).run();
  }

  async setLegalResult(id: string, result: LegalResult, nowIso: string): Promise<void> {
    await statement(
      this.db,
      `UPDATE invoices SET legal_provider = ?, legal_reference = ?, legal_status = ?, legal_message = ?, updated_at = ?
       WHERE id = ?`,
      [result.provider, result.reference, result.status, result.message, nowIso, id],
    ).run();
  }

  async void(record: VoidRecord): Promise<void> {
    // The timeline entry is written only when this call's update changed the row. Its timestamp is this call's, so a repeated
    // or losing void adds nothing.
    await this.db.batch([
      statement(
        this.db,
        `UPDATE invoices SET status = 'void', void_reason = ?, pdf_key = NULL, updated_at = ?
         WHERE id = ? AND status = 'issued'`,
        [record.reason, record.nowIso, record.id],
      ),
      statement(
        this.db,
        `INSERT INTO order_events (id, order_id, type, note, actor, created_at)
         SELECT ?, order_id, 'invoice_voided', ?, ?, ? FROM invoices
         WHERE id = ? AND status = 'void' AND updated_at = ?`,
        [record.eventId, record.reason, record.actorId, record.nowIso, record.id, record.nowIso],
      ),
    ]);
  }

  /**
   * Loads one invoice with its order number.
   * @param where SQL condition on the invoices alias `i`, with a ? placeholder.
   * @param value Value for the placeholder.
   * @returns The invoice, or null.
   */
  private async load(where: string, value: string): Promise<Invoice | null> {
    const row = await queryFirst<InvoiceRow>(
      this.db,
      `SELECT i.*, o.number AS order_number FROM invoices i JOIN orders o ON o.id = i.order_id WHERE ${where}`,
      [value],
    );
    return row ? toInvoice(row) : null;
  }
}
