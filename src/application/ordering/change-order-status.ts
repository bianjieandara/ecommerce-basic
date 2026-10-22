// ChangeOrderStatus: the owner or an editor moves an order by hand. Every move is checked against the order's state and written to
// the timeline with the admin who made it, and stock given back goes to the stock alerts. The customer hears of the move when
// asked to; a message that fails to queue is reported, never turned into an error for a change that was committed.
import { can } from '@/domain/identity/role';
import { assertTransition, type ManualOrderTarget } from '@/domain/ordering/order-status';
import { DomainError } from '@/domain/shared/errors';
import type { EvaluateStockChanges } from '../inventory/evaluate-stock-changes';
import type { NotificationService } from '../notifications/notification-service';
import type { SettingsRepository } from '../ports/content';
import type { AdminUser } from '../ports/identity';
import type { NotificationKey } from '../ports/notifications';
import type { OrderRepository } from '../ports/ordering';
import type { Clock } from '../ports/platform';
import type { ConfirmPayment } from './confirm-payment';
import { notifyOrderCustomer } from './customer-notice';
import type { OrderLinks } from './order-links';

/** The customer message for each target that has one. `paid` sends its own message, from ConfirmPayment. */
const NOTICE_KEYS: Partial<Record<ManualOrderTarget, NotificationKey>> = {
  processing: 'order_processing',
  shipped: 'order_shipped',
  delivered: 'order_delivered',
  cancelled: 'order_cancelled',
  refunded: 'order_refunded',
};

/** The message when another change won the race for the order. */
const CHANGED_MEANWHILE = 'The order changed. Reload it and try again.';

/** Dependencies of ChangeOrderStatus. */
export interface ChangeOrderStatusDeps {
  orders: OrderRepository;
  confirmPayment: ConfirmPayment;
  evaluateStock: EvaluateStockChanges;
  notifications: NotificationService;
  settings: SettingsRepository;
  links: OrderLinks;
  clock: Clock;
  siteUrl: string;
  /** Reports a failure after the change was committed (a message or a job). */
  onError: (event: string, error: unknown) => void;
}

/** What the screen sends. */
export interface ChangeOrderStatusInput {
  number: number;
  to: ManualOrderTarget;
  notify: boolean;
  trackingCode: string | null;
  note: string;
}

/** Moves orders through the states the owner may set by hand. */
export class ChangeOrderStatus {
  /** @param deps Repositories, payment and stock services, notifications, the clock and error reporting. */
  constructor(private readonly deps: ChangeOrderStatusDeps) {}

  /**
   * Moves an order to a new state.
   * @param actor Signed-in admin. Editors and owners may change orders.
   * @param input The order and the requested state.
   * @returns The state the order is in now.
   * @throws DomainError FORBIDDEN, NOT_FOUND, or INVALID_STATE when the move is not allowed or the order changed meanwhile.
   */
  async execute(actor: AdminUser, input: ChangeOrderStatusInput): Promise<{ status: ManualOrderTarget }> {
    if (!can(actor.role, 'orders.manage')) throw new DomainError('FORBIDDEN', 'You cannot change orders');
    const order = await this.deps.orders.findByNumber(input.number);
    if (!order) throw new DomainError('NOT_FOUND', 'Order not found');
    assertTransition(order.status, input.to);
    const nowIso = this.deps.clock.now().toISOString();

    if (input.to === 'paid') {
      const paid = await this.deps.confirmPayment.markPaid(order, actor.id, nowIso, input.notify, (error) =>
        this.deps.onError('order.follow_up_failed', error),
      );
      if (!paid) throw new DomainError('INVALID_STATE', CHANGED_MEANWHILE);
      return { status: 'paid' };
    }

    const event = { type: `status_${input.to}`, note: input.note, actor: actor.id, at: nowIso };
    if (input.to === 'cancelled') {
      const released = await this.deps.orders.cancelAndReleaseStock(order.id, order.status, event);
      if (!released.cancelled) throw new DomainError('INVALID_STATE', CHANGED_MEANWHILE);
      // The stock is back on the shelf, so the alerts must see it, like any other stock change. Evaluation never throws.
      await this.deps.evaluateStock.execute(released.restored);
    } else {
      const moved = await this.deps.orders.transition(
        order.id,
        order.status,
        input.to,
        event,
        input.trackingCode ? { trackingCode: input.trackingCode } : undefined,
      );
      if (!moved) throw new DomainError('INVALID_STATE', CHANGED_MEANWHILE);
    }

    const key = NOTICE_KEYS[input.to];
    if (input.notify && key) {
      await notifyOrderCustomer(
        {
          notifications: this.deps.notifications,
          settings: this.deps.settings,
          links: this.deps.links,
          siteUrl: this.deps.siteUrl,
        },
        { ...order, status: input.to, trackingCode: input.trackingCode ?? order.trackingCode },
        key,
      ).catch((error: unknown) => this.deps.onError('order.notice_failed', error));
    }
    return { status: input.to };
  }
}
