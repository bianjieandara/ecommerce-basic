// ExpireStaleOrders: cancels pending orders whose payment window has closed and gives their stock back. The scheduler
// runs it on every tick through the orders.expire_stale job.
import type { EvaluateStockChanges } from '../inventory/evaluate-stock-changes';
import type { SettingsRepository } from '../ports/content';
import type { OrderRepository } from '../ports/ordering';
import type { Clock } from '../ports/platform';
import type { NotificationService } from '../notifications/notification-service';
import type { OrderLinks } from './order-links';
import { loadOrderPresentation, orderSections } from './order-sections';

/** Dependencies of ExpireStaleOrders. */
export interface ExpireStaleOrdersDeps {
  orders: OrderRepository;
  notifications: NotificationService;
  settings: SettingsRepository;
  evaluateStock: EvaluateStockChanges;
  links: OrderLinks;
  clock: Clock;
  siteUrl: string;
}

/** Cancels abandoned orders. */
export class ExpireStaleOrders {
  /** @param deps Repositories, notifications and the clock. */
  constructor(private readonly deps: ExpireStaleOrdersDeps) {}

  /**
   * Cancels up to `limit` expired pending orders.
   * @param limit Largest number of orders handled in one run.
   * @returns How many orders this run cancelled.
   */
  async execute(limit = 50): Promise<{ cancelled: number }> {
    const nowIso = this.deps.clock.now().toISOString();
    const ids = await this.deps.orders.listExpiredPending(nowIso, limit);
    if (ids.length === 0) return { cancelled: 0 };
    const presentation = await loadOrderPresentation(this.deps.settings);
    let cancelled = 0;
    for (const id of ids) {
      const order = await this.deps.orders.findById(id);
      if (!order) continue;
      const released = await this.deps.orders.cancelAndReleaseStock(id, 'pending_payment', {
        type: 'expired',
        actor: 'system',
        at: nowIso,
      });
      await this.deps.evaluateStock.execute(released.restored);
      if (!released.cancelled) continue;
      cancelled += 1;
      await this.deps.notifications.notify({
        key: 'order_cancelled',
        reference: id,
        orderId: id,
        recipient: {
          email: order.customer.email,
          locale: order.locale,
          phone: order.customer.phone,
          whatsappOptIn: order.customer.whatsappOptIn,
        },
        context: orderSections(order, order.locale, {
          siteUrl: this.deps.siteUrl,
          presentation,
          accessKey: await this.deps.links.keyFor(order),
        }),
      });
    }
    return { cancelled };
  }
}
