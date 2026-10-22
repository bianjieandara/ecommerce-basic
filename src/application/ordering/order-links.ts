// OrderLinks: the key that goes in the order link of a message sent after checkout. The checkout key is shown once and only
// its hash is stored, so these messages use the key the server can rebuild from that hash (see access-key.ts).
import type { Order } from '../dto/order-dto';
import type { OrderRepository } from '../ports/ordering';
import type { Hasher } from '../ports/platform';
import { emailLinkKey } from './access-key';

/** Dependencies of OrderLinks. */
export interface OrderLinksDeps {
  orders: OrderRepository;
  hasher: Hasher;
}

/** Builds the access keys for order links in emails. */
export class OrderLinks {
  /** @param deps The order repository (for the stored key hash) and the hasher. */
  constructor(private readonly deps: OrderLinksDeps) {}

  /**
   * The key for an order's link in an email.
   * @param order The order the message is about.
   * @returns The key, or null when the order has no stored key (the message then carries no link).
   */
  async keyFor(order: Order): Promise<string | null> {
    const found = await this.deps.orders.findAccessKeyHash(order.number);
    return found ? emailLinkKey(this.deps.hasher, found.accessKeyHash) : null;
  }
}
