// ReportPurchase: queues the Meta Purchase event of a paid order. It runs after the payment is committed and never throws:
// a failure is logged and the payment stays confirmed. The event carries no customer data, because checkout does not
// record marketing consent yet (the marketing_consent column is always 0), so consent cannot be shown for any order.
import type { Order } from '../dto/order-dto';
import type { ConversionEvent } from '../ports/analytics';
import type { SettingsRepository } from '../ports/content';
import type { JobQueue } from '../ports/jobs';
import type { Clock, LogEvent } from '../ports/platform';
import { PATHS } from '@/domain/shared/paths';

/** Dependencies of ReportPurchase. */
export interface ReportPurchaseDeps {
  jobs: JobQueue;
  settings: SettingsRepository;
  clock: Clock;
  log: LogEvent;
}

/** Queues Purchase events for paid orders. */
export class ReportPurchase {
  /** @param deps Queue, settings, clock and logger. */
  constructor(private readonly deps: ReportPurchaseDeps) {}

  /**
   * Queues the Purchase event of one order. Called once per payment: the order moves to paid only once, and the job's
   * idempotency key is the order id, so a repeat cannot send it twice.
   * @param order Order as it was before it was marked paid (its items and totals do not change).
   */
  async execute(order: Order): Promise<void> {
    try {
      const marketing = await this.deps.settings.get('marketing');
      if (!marketing.metaCapiEnabled) return;
      // Without the buyer's consent no request goes to Meta, not even one without personal data.
      if (!order.marketingConsent) return;
      const event: ConversionEvent = {
        eventId: `purchase-${order.id}`,
        name: 'purchase',
        occurredAt: this.deps.clock.now().toISOString(),
        path: PATHS.checkoutSuccess(order.locale),
        currency: order.currency,
        valueMinor: order.totalMinor,
        items: order.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          priceMinor: item.unitPriceMinor,
        })),
        orderId: order.id,
        ip: null,
        userAgent: null,
        fbp: null,
        fbc: null,
        email: null,
        phone: null,
      };
      await this.deps.jobs.enqueue('marketing.meta_capi', event, {
        idempotencyKey: `capi:purchase:${order.id}`,
      });
    } catch (error) {
      this.deps.log('meta_capi.purchase_enqueue_failed', {
        orderId: order.id,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
