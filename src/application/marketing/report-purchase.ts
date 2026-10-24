// ReportPurchase: queues the purchase events of a paid order, one job per platform: the Meta Conversions API and GA4's Measurement
// Protocol. It runs after the payment is committed and never throws: a failure is logged and the payment stays confirmed. Each
// platform has its own try, so a failure on one never stops the other. Nothing is sent for an order whose buyer did not grant
// marketing consent at checkout.
import type { Order } from '../dto/order-dto';
import type { ConversionEvent, Ga4Purchase } from '../ports/analytics';
import type { SettingsRepository } from '../ports/content';
import type { JobQueue } from '../ports/jobs';
import type { Clock, LogEvent } from '../ports/platform';
import { purchaseEventId } from '@/domain/analytics/tracked-events';
import { PATHS } from '@/domain/shared/paths';

/** Dependencies of ReportPurchase. */
export interface ReportPurchaseDeps {
  jobs: JobQueue;
  settings: SettingsRepository;
  clock: Clock;
  log: LogEvent;
}

/** Queues purchase events for paid orders. */
export class ReportPurchase {
  /** @param deps Queue, settings, clock and logger. */
  constructor(private readonly deps: ReportPurchaseDeps) {}

  /**
   * Queues the purchase events of one order. Called once per payment: the order moves to paid only once, and each job's
   * idempotency key is the order id, so a repeat cannot send it twice.
   * @param order Order as it was before it was marked paid (its items and totals do not change).
   */
  async execute(order: Order): Promise<void> {
    try {
      // Without the buyer's consent no request goes to any platform, not even one without personal data.
      if (!order.marketingConsent) return;
      const marketing = await this.deps.settings.get('marketing');
      if (marketing.metaCapiEnabled) await this.queueMeta(order);
      if (marketing.ga4MeasurementId.trim() !== '') await this.queueGa4(order);
    } catch (error) {
      this.deps.log('purchase_report.failed', {
        orderId: order.id,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  /**
   * Queues the Meta Purchase event.
   * @param order The paid order.
   */
  private async queueMeta(order: Order): Promise<void> {
    try {
      const event: ConversionEvent = {
        eventId: purchaseEventId(order.id),
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

  /**
   * Queues the GA4 purchase. GA4 needs the visitor id from the buyer's cookie; an order without one (the buyer accepted marketing
   * after the cart, or GA4 was not set up yet) is left to the browser's own event.
   * @param order The paid order.
   */
  private async queueGa4(order: Order): Promise<void> {
    try {
      if (!order.gaClientId) return;
      const purchase: Ga4Purchase = {
        transactionId: order.id,
        clientId: order.gaClientId,
        sessionId: order.gaSessionId,
        currency: order.currency,
        valueMinor: order.totalMinor,
        taxMinor: order.taxMinor,
        shippingMinor: order.shippingMinor,
        items: order.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          priceMinor: item.unitPriceMinor,
        })),
      };
      await this.deps.jobs.enqueue('marketing.ga4_purchase', purchase, {
        idempotencyKey: `ga4:purchase:${order.id}`,
      });
    } catch (error) {
      this.deps.log('ga4_purchase.enqueue_failed', {
        orderId: order.id,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
