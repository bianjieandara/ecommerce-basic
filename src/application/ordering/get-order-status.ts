// GetOrderStatus: loads an order for its public page. The access key must match; otherwise nothing is returned, so an
// order number alone reveals nothing.
import { formatInvoiceNumber } from '@/domain/invoicing/invoice';
import type { Order } from '../dto/order-dto';
import type { InvoiceRepository } from '../ports/invoicing';
import type { OrderEvent, OrderRepository } from '../ports/ordering';
import type { Hasher } from '../ports/platform';
import { accessKeyMatches } from './access-key';

/** An order, its timeline and its invoice number when one exists. */
export interface OrderStatusView {
  order: Order;
  events: OrderEvent[];
  invoiceNumber: string | null;
}

/** Dependencies of GetOrderStatus. */
export interface GetOrderStatusDeps {
  orders: OrderRepository;
  invoices: InvoiceRepository;
  hasher: Hasher;
}

/** Reads orders for their public pages. */
export class GetOrderStatus {
  /** @param deps Repositories and the hasher. */
  constructor(private readonly deps: GetOrderStatusDeps) {}

  /**
   * Loads an order if the key is right.
   * @param number Order number from the link.
   * @param key Access key from the link.
   * @returns The order, its events and invoice number, or null when the number or key is wrong.
   */
  async execute(number: number, key: string): Promise<OrderStatusView | null> {
    const found = await this.deps.orders.findAccessKeyHash(number);
    if (!found || !(await accessKeyMatches(this.deps.hasher, key, found.accessKeyHash))) return null;
    const order = await this.deps.orders.findById(found.id);
    if (!order) return null;
    const invoice = await this.deps.invoices.findByOrderId(found.id);
    return {
      order,
      events: await this.deps.orders.listEvents(found.id),
      invoiceNumber: invoice ? formatInvoiceNumber(invoice.series, invoice.number) : null,
    };
  }
}
