// IssueInvoice: gives a paid order its consecutive invoice. Idempotent: an order keeps the invoice it already has. The PDF
// and the customer email follow in the invoice.render_pdf job.
import { isPaidOrLater } from '@/domain/ordering/order-status';
import { summarizeTaxes, type TaxBreakdownRow } from '@/domain/ordering/tax';
import { DomainError } from '@/domain/shared/errors';
import type { Order } from '../dto/order-dto';
import type { SettingsRepository } from '../ports/content';
import type { Invoice, InvoiceRepository, LegalInvoiceIssuer, NewInvoice } from '../ports/invoicing';
import type { JobQueue } from '../ports/jobs';
import type { OrderRepository } from '../ports/ordering';
import type { Clock, IdGenerator } from '../ports/platform';

/** Dependencies of IssueInvoice. */
export interface IssueInvoiceDeps {
  orders: OrderRepository;
  invoices: InvoiceRepository;
  settings: SettingsRepository;
  jobs: JobQueue;
  legal: LegalInvoiceIssuer;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Tax per rate for an invoice. Each line carries its own rate. Any shipping tax left over is shown at the default rate.
 * @param order Order snapshot.
 * @param defaultRateBp Store default rate, in basis points.
 * @returns One row per rate.
 */
function taxBreakdown(order: Order, defaultRateBp: number): TaxBreakdownRow[] {
  const included = order.pricesIncludeTax;
  const rows = order.items.map((item) => {
    const gross = included ? item.lineTotalMinor : item.lineTotalMinor + item.taxMinor;
    return { rateBp: item.taxRateBp, netMinor: gross - item.taxMinor, taxMinor: item.taxMinor };
  });
  const shippingTax = order.taxMinor - order.items.reduce((sum, item) => sum + item.taxMinor, 0);
  if (shippingTax > 0) {
    const gross = included ? order.shippingMinor : order.shippingMinor + shippingTax;
    rows.push({ rateBp: defaultRateBp, netMinor: gross - shippingTax, taxMinor: shippingTax });
  }
  return summarizeTaxes(rows);
}

/** Issues invoices for paid orders. */
export class IssueInvoice {
  /** @param deps Repositories, settings, the job queue and the legal hook. */
  constructor(private readonly deps: IssueInvoiceDeps) {}

  /**
   * Issues the invoice of a paid order when the store issues invoices on payment. Otherwise does nothing.
   * @param orderId Order id.
   * @returns The invoice, or null when automatic issuing is off.
   */
  async executeIfAutomatic(orderId: string): Promise<Invoice | null> {
    const invoicing = await this.deps.settings.get('invoicing');
    if (!invoicing.enabled || invoicing.autoIssue !== 'on_paid') return null;
    return this.execute(orderId);
  }

  /**
   * Issues the invoice of a paid order, or returns the invoice it already has.
   * @param orderId Order id.
   * @returns The invoice.
   * @throws DomainError INVALID_STATE when the order is unpaid or invoicing is disabled.
   */
  async execute(orderId: string): Promise<Invoice> {
    const existing = await this.deps.invoices.findByOrderId(orderId);
    if (existing) return existing;
    const order = await this.deps.orders.findById(orderId);
    if (!order) throw new DomainError('NOT_FOUND', 'Order not found');
    if (!isPaidOrLater(order.status))
      throw new DomainError('INVALID_STATE', 'Only paid orders get an invoice');
    const [general, tax, invoicing] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('tax'),
      this.deps.settings.get('invoicing'),
    ]);
    if (!invoicing.enabled) throw new DomainError('INVALID_STATE', 'Invoicing is disabled');

    const draft: NewInvoice = {
      id: this.deps.ids.newId(),
      orderId: order.id,
      series: invoicing.series,
      currency: order.currency,
      locale: order.locale,
      pricesIncludeTax: order.pricesIncludeTax,
      subtotalMinor: order.subtotalMinor,
      taxMinor: order.taxMinor,
      shippingMinor: order.shippingMinor,
      totalMinor: order.totalMinor,
      seller: {
        legalName: invoicing.legalName || general.storeName,
        taxId: invoicing.taxId,
        taxIdType: invoicing.taxIdType,
        taxRegime: invoicing.taxRegime,
        address: invoicing.address,
        phone: invoicing.phone,
        email: invoicing.email,
      },
      buyer: {
        name: order.customer.name,
        email: order.customer.email,
        phone: order.customer.phone,
        taxId: order.billing?.taxId || null,
        legalName: order.billing?.legalName || null,
        address: order.shippingAddress,
      },
      lines: order.items.map((item) => ({
        description: item.variantLabel ? `${item.productName} (${item.variantLabel})` : item.productName,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        taxRateBp: item.taxRateBp,
        taxMinor: item.taxMinor,
        lineTotalMinor: item.lineTotalMinor,
      })),
      taxBreakdown: taxBreakdown(order, tax.defaultRateBp),
      issuedAt: this.deps.clock.now().toISOString(),
    };

    let invoice: Invoice;
    try {
      invoice = await this.deps.invoices.issue(draft);
    } catch (error) {
      // Two payment events for one order can race. The loser finds the invoice the winner created.
      if (error instanceof DomainError && error.code === 'CONFLICT') {
        const raced = await this.deps.invoices.findByOrderId(orderId);
        if (raced) return raced;
      }
      throw error;
    }
    await this.deps.jobs.enqueue(
      'invoice.render_pdf',
      { invoiceId: invoice.id },
      { idempotencyKey: `invoice-pdf:${invoice.id}` },
    );
    if (this.deps.legal.isEnabled()) {
      await this.deps.jobs.enqueue(
        'invoice.legal_issue',
        { invoiceId: invoice.id },
        { idempotencyKey: `invoice-legal:${invoice.id}` },
      );
    }
    return invoice;
  }
}
