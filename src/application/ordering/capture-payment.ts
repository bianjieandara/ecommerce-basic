// CapturePayment: captures a payment when the customer returns to the store from the provider, then applies the result
// through ConfirmPayment, the same path webhooks use.
import { DomainError } from '@/domain/shared/errors';
import type { OrderRepository } from '../ports/ordering';
import type { PaymentGateway, PaymentMethod } from '../ports/payments';
import type { ConfirmPayment } from './confirm-payment';

/** Dependencies of CapturePayment. */
export interface CapturePaymentDeps {
  orders: OrderRepository;
  gateways: Record<PaymentMethod, PaymentGateway>;
  confirmPayment: ConfirmPayment;
}

/** Captures payments whose customers come back to the store. */
export class CapturePayment {
  /** @param deps Repositories, gateways and the confirmation use case. */
  constructor(private readonly deps: CapturePaymentDeps) {}

  /**
   * Captures the payment of an order and applies the result.
   * @param orderId Order id. The caller has already checked the customer's access key.
   * @param providerReference Provider reference from the return link when the provider sends one (PayPal does); it must be the
   * one stored with the order. Without it the stored reference is used (dLocal Go sends the customer back with no reference).
   * @throws DomainError NOT_FOUND when the reference does not belong to the order.
   */
  async execute(orderId: string, providerReference?: string): Promise<void> {
    const order = await this.deps.orders.findById(orderId);
    const reference = providerReference ?? order?.paymentReference;
    if (!order || !reference || order.paymentReference !== reference) {
      throw new DomainError('NOT_FOUND', 'Order not found');
    }
    const gateway = this.deps.gateways[order.paymentMethod];
    if (!gateway.capture)
      throw new DomainError('INVALID_STATE', 'This payment method is not captured by the store');
    const confirmation = await gateway.capture(reference, order.id);
    if (confirmation) await this.deps.confirmPayment.execute(confirmation);
  }
}
