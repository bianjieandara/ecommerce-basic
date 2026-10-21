// ConfirmPayment: applies one payment event from a provider (webhook, return page or capture). Each provider event is
// processed once, and an event for an order that has already moved on changes nothing.
import { canTransition } from '@/domain/ordering/order-status';
import { DomainError } from '@/domain/shared/errors';
import type { Order } from '../dto/order-dto';
import type { SettingsRepository } from '../ports/content';
import type { OrderRepository } from '../ports/ordering';
import type { Clock } from '../ports/platform';
import type { PaymentConfirmation, PaymentEventLog } from '../ports/payments';
import type { NotificationService } from '../notifications/notification-service';
import { loadOrderPresentation, orderSections } from './order-sections';

/** Dependencies of ConfirmPayment. */
export interface ConfirmPaymentDeps {
  orders: OrderRepository;
  events: PaymentEventLog;
  notifications: NotificationService;
  settings: SettingsRepository;
  clock: Clock;
  siteUrl: string;
}

/** Result of one confirmation. */
export interface ConfirmationResult {
  /** False when the event was a repeat or refers to no known order. */
  handled: boolean;
  orderNumber: number | null;
}

/** Applies payment events to orders. */
export class ConfirmPayment {
  /** @param deps Repositories, the event log and notifications. */
  constructor(private readonly deps: ConfirmPaymentDeps) {}

  /**
   * Applies one payment event.
   * @param confirmation Normalized event from a gateway.
   * @returns Whether the event was new and which order it touched.
   * @throws DomainError VALIDATION_FAILED when the amount or currency differs from the order. The event is not
   * recorded, so the provider retries it.
   */
  async execute(confirmation: PaymentConfirmation): Promise<ConfirmationResult> {
    const order = await this.deps.orders.findByPaymentReference(
      confirmation.provider,
      confirmation.providerReference,
    );
    if (!order) return { handled: false, orderNumber: null };
    if (confirmation.amountMinor !== order.totalMinor || confirmation.currency !== order.currency) {
      throw new DomainError('VALIDATION_FAILED', 'Payment amount or currency does not match the order');
    }
    const nowIso = this.deps.clock.now().toISOString();
    if (!(await this.deps.events.recordIfNew(confirmation.provider, confirmation.eventId, nowIso))) {
      return { handled: false, orderNumber: order.number };
    }

    const actor = confirmation.provider;
    switch (confirmation.outcome) {
      case 'succeeded': {
        const paid = await this.deps.orders.transition(
          order.id,
          'pending_payment',
          'paid',
          { type: 'payment_confirmed', actor, at: nowIso },
          { paidAt: nowIso },
        );
        if (paid) await this.notifyCustomer(order, 'payment_confirmed');
        break;
      }
      case 'failed':
      case 'expired': {
        // A late payment for an order already cancelled is not revived: the stock may have been sold.
        const type = confirmation.outcome === 'failed' ? 'payment_failed' : 'payment_expired';
        const cancelled = await this.deps.orders.cancelAndReleaseStock(order.id, 'pending_payment', {
          type,
          actor,
          at: nowIso,
        });
        if (cancelled) await this.notifyCustomer(order, 'order_cancelled');
        break;
      }
      case 'refunded': {
        if (canTransition(order.status, 'refunded')) {
          const refunded = await this.deps.orders.transition(order.id, order.status, 'refunded', {
            type: 'refunded',
            actor,
            at: nowIso,
          });
          if (refunded) await this.notifyCustomer(order, 'order_refunded');
        }
        break;
      }
    }
    return { handled: true, orderNumber: order.number };
  }

  /**
   * Queues the customer message for a change. The order link is left out: only the hash is stored after checkout.
   * @param order Order before the change.
   * @param key Message to send.
   */
  private async notifyCustomer(
    order: Order,
    key: 'payment_confirmed' | 'order_cancelled' | 'order_refunded',
  ): Promise<void> {
    await this.deps.notifications.notify({
      key,
      reference: order.id,
      orderId: order.id,
      recipient: { email: order.customer.email, locale: order.locale },
      context: orderSections(order, order.locale, {
        siteUrl: this.deps.siteUrl,
        presentation: await loadOrderPresentation(this.deps.settings),
        accessKey: null,
      }),
    });
  }
}
