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
  /** Structured log line, for the orders this run could not finish. */
  log: (event: string, data: Record<string, unknown>) => void;
}

/** What one run did. */
export interface ExpireStaleOrdersResult {
  /** Orders this run cancelled. */
  cancelled: number;
  /** Orders whose cancellation failed; they are still pending and the next tick tries them again. */
  failed: number;
}

/** Cancels abandoned orders. */
export class ExpireStaleOrders {
  /** @param deps Repositories, notifications and the clock. */
  constructor(private readonly deps: ExpireStaleOrdersDeps) {}

  /**
   * Cancels up to `limit` expired pending orders. The orders and the settings are read once for the whole run; each
   * cancellation is its own atomic write, and one that fails is counted and logged without stopping the others.
   * @param limit Largest number of orders handled in one run.
   * @returns How many orders this run cancelled, and how many it could not.
   */
  async execute(limit = 50): Promise<ExpireStaleOrdersResult> {
    const nowIso = this.deps.clock.now().toISOString();
    const ids = await this.deps.orders.listExpiredPending(nowIso, limit);
    if (ids.length === 0) return { cancelled: 0, failed: 0 };
    const [presentation, orders] = await Promise.all([
      loadOrderPresentation(this.deps.settings),
      this.deps.orders.findByIds(ids),
    ]);
    const byId = new Map(orders.map((order) => [order.id, order]));
    let cancelled = 0;
    let failed = 0;
    for (const id of ids) {
      const order = byId.get(id);
      if (!order) continue;
      let released;
      try {
        released = await this.deps.orders.cancelAndReleaseStock(id, 'pending_payment', {
          type: 'expired',
          actor: 'system',
          at: nowIso,
        });
      } catch (error) {
        failed += 1;
        this.deps.log('orders.expire_failed', { orderId: id, reason: String(error) });
        continue;
      }
      if (released.cancelled) cancelled += 1;
      // The cancellation has committed: nothing below may fail the run or hide the orders still waiting.
      try {
        await this.deps.evaluateStock.execute(released.restored);
        if (!released.cancelled) continue;
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
      } catch (error) {
        this.deps.log('orders.expire_follow_up_failed', { orderId: id, reason: String(error) });
      }
    }
    return { cancelled, failed };
  }
}
