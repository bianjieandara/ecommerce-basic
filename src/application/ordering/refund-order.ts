// RefundOrder: an owner sends the whole payment of a paid order back to the customer through the payment provider. Money moves, so
// the rules are strict: owners only, one request per order, and a failure the provider reported leaves nothing behind. The order
// becomes refunded through ConfirmPayment, the path the provider's own notification takes, so a refund is applied once however it
// is reported.
import { assertNotDemoAccount } from '@/domain/demo/demo-account';
import { can } from '@/domain/identity/role';
import { canTransition } from '@/domain/ordering/order-status';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../ports/identity';
import type { OrderRepository } from '../ports/ordering';
import {
  refundRequestEventId,
  type PaymentEventLog,
  type PaymentGateway,
  type PaymentMethod,
} from '../ports/payments';
import type { Clock } from '../ports/platform';
import type { ConfirmPayment } from './confirm-payment';

/** Dependencies of RefundOrder. */
export interface RefundOrderDeps {
  orders: OrderRepository;
  gateways: Record<PaymentMethod, PaymentGateway>;
  /** The log that makes "one refund request per order" atomic. */
  events: PaymentEventLog;
  confirmPayment: ConfirmPayment;
  clock: Clock;
  /** Public site URL without a trailing slash. */
  siteUrl: string;
  /** Reports a failure after the money has moved: the request itself still succeeds. */
  onError: (event: string, error: unknown) => void;
}

/** What the owner is told. */
export interface RefundOutcome {
  /** "refunded" when the provider finished at once; "pending" when its notification will move the order. */
  status: 'refunded' | 'pending';
  providerRefundId: string;
}

/** Refunds paid orders through their payment provider. */
export class RefundOrder {
  /** @param deps Repositories, gateways, the event log, payment confirmation and the clock. */
  constructor(private readonly deps: RefundOrderDeps) {}

  /**
   * Refunds an order in full.
   * @param actor Signed-in admin. Only owners may refund.
   * @param orderNumber The order's public number.
   * @returns The outcome. The order is already refunded, or will be when the provider confirms.
   * @throws DomainError FORBIDDEN, NOT_FOUND, INVALID_STATE (not paid, or a method refunded outside the store), CONFLICT (a refund
   * was already requested), REFUND_REFUSED (the provider said no), PAYMENT_PROVIDER_ERROR (it is not known whether it worked).
   */
  async execute(actor: AdminUser, orderNumber: number): Promise<RefundOutcome> {
    assertNotDemoAccount(actor);
    if (!can(actor.role, 'orders.refund')) throw new DomainError('FORBIDDEN', 'Only owners can refund');
    const order = await this.deps.orders.findByNumber(orderNumber);
    if (!order) throw new DomainError('NOT_FOUND', 'Order not found');
    const gateway = this.deps.gateways[order.paymentMethod];
    if (!gateway.refund || !order.paymentReference) {
      throw new DomainError('INVALID_STATE', 'This payment method is refunded outside the store');
    }
    if (!canTransition(order.status, 'refunded')) {
      throw new DomainError('INVALID_STATE', 'Only a paid order can be refunded');
    }

    const nowIso = this.deps.clock.now().toISOString();
    // The claim is atomic: of two clicks at the same moment only one gets past this line, and so only one reaches the provider.
    const claim = refundRequestEventId(order.id);
    if (!(await this.deps.events.recordIfNew(order.paymentMethod, claim, nowIso))) {
      throw new DomainError('CONFLICT', 'A refund of this order was already requested');
    }
    let result;
    try {
      result = await gateway.refund({
        order: { id: order.id, number: order.number, totalMinor: order.totalMinor, currency: order.currency },
        providerReference: order.paymentReference,
        origin: this.deps.siteUrl,
      });
    } catch (error) {
      // A refusal means nothing was created, so the owner may try again. After a failure that leaves it unknown, the claim stays
      // (the provider may have refunded) unless asking twice is harmless for this provider.
      const definite = error instanceof DomainError && error.code === 'REFUND_REFUSED';
      if (definite || gateway.refundsAreIdempotent) {
        await this.deps.events.forget(order.paymentMethod, claim).catch(() => undefined);
      }
      throw error;
    }

    // From here the money is moving: nothing below may fail the request.
    await this.deps.orders
      .transition(order.id, order.status, order.status, {
        type: 'refund_requested',
        note: result.providerRefundId,
        actor: actor.id,
        at: nowIso,
      })
      .catch((error: unknown) => this.deps.onError('refund.timeline_failed', error));
    let applied = false;
    if (result.confirmation) {
      applied = await this.deps.confirmPayment
        .execute(result.confirmation)
        .then(() => true)
        .catch((error: unknown) => {
          this.deps.onError('refund.confirm_failed', error);
          return false;
        });
    }
    return { status: applied ? 'refunded' : 'pending', providerRefundId: result.providerRefundId };
  }
}
