// ConfirmPayment: applies one payment event from a provider (webhook, return page or capture). Every change is guarded by the
// order's current status, so a repeated or late event never changes anything that is not already true. The store owner can also
// mark an order paid by hand (bank transfer, cash on delivery) through the same steps.
import { canTransition, isPaidOrLater } from '@/domain/ordering/order-status';
import { DomainError } from '@/domain/shared/errors';
import type { Order } from '../dto/order-dto';
import type { EvaluateStockChanges } from '../inventory/evaluate-stock-changes';
import type { NotificationService } from '../notifications/notification-service';
import type { SettingsRepository } from '../ports/content';
import type { JobQueue } from '../ports/jobs';
import type { OrderRepository } from '../ports/ordering';
import type { PaymentConfirmation, PaymentEventLog } from '../ports/payments';
import type { Clock, LogEvent } from '../ports/platform';
import type { ReportPurchase } from '../marketing/report-purchase';
import { notifyOrderCustomer } from './customer-notice';
import type { OrderLinks } from './order-links';

/** Dependencies of ConfirmPayment. */
export interface ConfirmPaymentDeps {
  orders: OrderRepository;
  events: PaymentEventLog;
  notifications: NotificationService;
  settings: SettingsRepository;
  jobs: JobQueue;
  links: OrderLinks;
  evaluateStock: EvaluateStockChanges;
  /** Queues the Meta Purchase event once the order is paid. Never throws. */
  purchase: ReportPurchase;
  clock: Clock;
  /** Structured logger, for events the store owner has to act on by hand. */
  log: LogEvent;
  siteUrl: string;
}

/** Result of one confirmation. */
export interface ConfirmationResult {
  /** False when the event was a repeat or refers to no known order. */
  handled: boolean;
  orderNumber: number | null;
}

/** Customer messages this class sends. */
type PaymentNotice = 'payment_confirmed' | 'order_cancelled' | 'order_refunded';

/** Applies payment events to orders. */
export class ConfirmPayment {
  /** @param deps Repositories, the event log, notifications and invoicing. */
  constructor(private readonly deps: ConfirmPaymentDeps) {}

  /**
   * Applies one payment event.
   * @param confirmation Normalized event from a gateway.
   * @returns Whether the event was new and which order it touched.
   * @throws DomainError VALIDATION_FAILED when the amount or currency differs from the order. Nothing is applied and the
   * event is not recorded, so the provider retries it.
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
    if (confirmation.outcome === 'succeeded' && order.status === 'cancelled') {
      // The customer paid for an order that was already cancelled and whose stock was released, so it is not revived. Nothing else
      // in the store reverses the charge, so it is logged for the owner to refund in the provider's dashboard.
      this.deps.log('payment.late_for_cancelled_order', {
        orderNumber: order.number,
        provider: confirmation.provider,
        providerReference: confirmation.providerReference,
        amountMinor: confirmation.amountMinor,
        currency: confirmation.currency,
      });
    }
    await this.apply(order, confirmation, nowIso);
    // Recorded last: if a step above failed, the provider retries the event and it is applied again. Every step is
    // idempotent, so a retry is safe.
    const isNew = await this.deps.events.recordIfNew(confirmation.provider, confirmation.eventId, nowIso);
    return { handled: isNew, orderNumber: order.number };
  }

  /**
   * Marks a pending order as paid by hand. Bank transfers and cash on delivery have no gateway event, so the owner confirms them
   * here. The change, the customer message and the invoice job are the steps a gateway confirmation takes.
   * @param order Order as loaded.
   * @param actorId Admin who confirmed the payment; it is written on the timeline.
   * @param nowIso Time of the change.
   * @param notify Whether the customer gets the payment message.
   * @param onFollowUpError Receives a failure of the message or the invoice job. The payment is already recorded, so the caller's
   * request still succeeds.
   * @returns False, and changes nothing, when the order is no longer pending.
   */
  async markPaid(
    order: Order,
    actorId: string,
    nowIso: string,
    notify: boolean,
    onFollowUpError: (error: unknown) => void,
  ): Promise<boolean> {
    return this.applyPaid(order, actorId, nowIso, notify, onFollowUpError);
  }

  /**
   * Applies the outcome of an event to the order, guarded by its current status.
   * @param order Order as loaded.
   * @param confirmation The event.
   * @param nowIso Time of the change.
   */
  private async apply(order: Order, confirmation: PaymentConfirmation, nowIso: string): Promise<void> {
    const actor = confirmation.provider;
    switch (confirmation.outcome) {
      case 'succeeded': {
        // Errors propagate here, so the provider retries the event; every step is idempotent.
        await this.applyPaid(order, actor, nowIso, true);
        return;
      }
      case 'failed':
      case 'expired': {
        // A late payment for an order already cancelled is not revived: the stock may have been sold.
        const type = confirmation.outcome === 'failed' ? 'payment_failed' : 'payment_expired';
        const released = await this.deps.orders.cancelAndReleaseStock(order.id, 'pending_payment', {
          type,
          actor,
          at: nowIso,
        });
        await this.deps.evaluateStock.execute(released.restored);
        if (released.cancelled) await this.notifyCustomer(order, 'order_cancelled');
        return;
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
        return;
      }
    }
  }

  /**
   * Moves a pending order to paid, then queues the customer message and the invoice. Work after the change is not allowed to undo
   * it: with an error handler, a failure there is reported and the result still says the order was paid.
   * @param order Order as loaded.
   * @param actor Who recorded the payment: the gateway, or an admin id.
   * @param nowIso Time of the change.
   * @param notify Whether the customer gets the payment message.
   * @param onFollowUpError Optional handler for failures after the change.
   * @returns Whether this call moved the order.
   */
  private async applyPaid(
    order: Order,
    actor: string,
    nowIso: string,
    notify: boolean,
    onFollowUpError?: (error: unknown) => void,
  ): Promise<boolean> {
    const paid = await this.deps.orders.transition(
      order.id,
      'pending_payment',
      'paid',
      { type: 'payment_confirmed', actor, at: nowIso },
      { paidAt: nowIso },
    );
    const followUp = async (): Promise<void> => {
      if (paid && notify) await this.notifyCustomer(order, 'payment_confirmed');
      // Only the call that moved the order reports the purchase, so a repeated event never queues a second one.
      if (paid) await this.deps.purchase.execute(order);
      // Issuing runs as a job, not here: a failure that keeps happening would otherwise fail the webhook until the provider gives
      // up on the endpoint, and no payment would be confirmed at all. The job is idempotent and retried.
      if (paid || isPaidOrLater(order.status)) {
        await this.deps.jobs.enqueue(
          'invoice.issue',
          { orderId: order.id },
          { idempotencyKey: `invoice-issue:${order.id}` },
        );
      }
    };
    if (onFollowUpError) await followUp().catch(onFollowUpError);
    else await followUp();
    return paid;
  }

  /**
   * Queues the customer message for a change.
   * @param order Order before the change.
   * @param key Message to send.
   */
  private async notifyCustomer(order: Order, key: PaymentNotice): Promise<void> {
    await notifyOrderCustomer(
      {
        notifications: this.deps.notifications,
        settings: this.deps.settings,
        links: this.deps.links,
        siteUrl: this.deps.siteUrl,
      },
      order,
      key,
    );
  }
}
