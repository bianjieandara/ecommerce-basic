// GetOrderStatus: loads an order for its public page. The access key must match; otherwise nothing is returned, so an
// order number alone reveals nothing.
import type { Order } from '../dto/order-dto';
import type { OrderEvent, OrderRepository } from '../ports/ordering';
import type { Hasher } from '../ports/platform';
import { accessKeyMatches } from './access-key';

/** An order and its timeline. */
export interface OrderStatusView {
  order: Order;
  events: OrderEvent[];
}

/** Reads orders for their public pages. */
export class GetOrderStatus {
  /** @param deps Order repository and hasher. */
  constructor(private readonly deps: { orders: OrderRepository; hasher: Hasher }) {}

  /**
   * Loads an order if the key is right.
   * @param number Order number from the link.
   * @param key Access key from the link.
   * @returns The order and its events, or null when the number or key is wrong.
   */
  async execute(number: number, key: string): Promise<OrderStatusView | null> {
    const found = await this.deps.orders.findAccessKeyHash(number);
    if (!found || !(await accessKeyMatches(this.deps.hasher, key, found.accessKeyHash))) return null;
    const order = await this.deps.orders.findById(found.id);
    if (!order) return null;
    return { order, events: await this.deps.orders.listEvents(found.id) };
  }
}
