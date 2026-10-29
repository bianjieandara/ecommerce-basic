// The buyer's proof of payment for an order paid by hand. Nothing here confirms the payment: the store still looks at the
// money and confirms the order from the admin. This only carries the picture, so the proof stops travelling by WhatsApp.
import { isInstructedMethod, loadOrderPresentation, orderSections } from './order-sections';
import { accessKeyMatches } from './access-key';
import {
  MAX_RECEIPT_BYTES,
  isReceiptType,
  receiptKey,
  type ReceiptType,
} from '@/domain/ordering/payment-receipt';
import { DomainError } from '@/domain/shared/errors';
import type { MediaStorage } from '../ports/media';
import type { NotificationService } from '../notifications/notification-service';
import type { SettingsRepository } from '../ports/content';
import type { OrderRepository } from '../ports/ordering';
import type { Clock, Hasher, IdGenerator } from '../ports/platform';

/** What the buyer sent. The bytes are already in memory: the endpoint refuses anything larger than the limit. */
export interface PaymentReceiptInput {
  number: number;
  accessKey: string;
  contentType: string;
  bytes: ArrayBuffer;
}

/** Dependencies of SubmitPaymentReceipt. */
export interface SubmitPaymentReceiptDeps {
  orders: OrderRepository;
  storage: MediaStorage;
  settings: SettingsRepository;
  notifications: NotificationService;
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
  siteUrl: string;
}

/** Stores a proof of payment against an order that is waiting to be paid by hand. */
export class SubmitPaymentReceipt {
  /** @param deps Repositories, object storage, notifications and the clock. */
  constructor(private readonly deps: SubmitPaymentReceiptDeps) {}

  /**
   * Stores the receipt and tells the store it arrived.
   * @param input Order number, access key from the link, and the file.
   * @returns When the receipt was recorded.
   * @throws DomainError NOT_FOUND for a wrong number or key, VALIDATION_FAILED for a file the store does not take, and
   * INVALID_STATE when the order is no longer waiting for a payment made by hand.
   */
  async execute(input: PaymentReceiptInput): Promise<{ uploadedAt: string }> {
    if (!isReceiptType(input.contentType)) {
      throw new DomainError('VALIDATION_FAILED', 'That file type is not accepted');
    }
    if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_RECEIPT_BYTES) {
      throw new DomainError('VALIDATION_FAILED', 'The file is empty or too large');
    }
    const type: ReceiptType = input.contentType;

    // The same check the order page makes: a wrong number and a wrong key fail the same way, so neither reveals the other.
    const found = await this.deps.orders.findAccessKeyHash(input.number);
    if (!found || !(await accessKeyMatches(this.deps.hasher, input.accessKey, found.accessKeyHash))) {
      throw new DomainError('NOT_FOUND', 'Order not found');
    }
    const order = await this.deps.orders.findById(found.id);
    if (!order) throw new DomainError('NOT_FOUND', 'Order not found');
    if (order.status !== 'pending_payment') {
      throw new DomainError('INVALID_STATE', 'This order is not waiting for a payment');
    }
    if (!isInstructedMethod(order.paymentMethod)) {
      // A card or PayPal order is settled by its provider; a picture would prove nothing and could not be acted on.
      throw new DomainError('INVALID_STATE', 'This payment method takes no receipt');
    }

    const at = this.deps.clock.now().toISOString();
    const key = receiptKey(order.id, type, this.deps.ids.newId());
    await this.deps.storage.put(key, input.bytes, type);

    const written = await this.deps.orders.setPaymentReceipt(order.id, key, {
      type: 'payment_receipt_uploaded',
      actor: 'customer',
      at,
    });
    if (!written) {
      // The order was settled or cancelled while the bytes were being stored, so they belong to nothing.
      await this.deps.storage.delete([key]).catch(() => {});
      throw new DomainError('INVALID_STATE', 'This order is not waiting for a payment');
    }

    // The receipt is stored. Nothing below may fail the request: the buyer has done their part either way.
    await this.afterStored(order.id, written.previousKey, order.number);
    return { uploadedAt: at };
  }

  /**
   * Clears the replaced file and tells the store a receipt is waiting. Both failures are logged, never thrown.
   * @param orderId Order the receipt belongs to.
   * @param previousKey Receipt this one replaced, if any.
   * @param number Order number, for the log line.
   */
  private async afterStored(orderId: string, previousKey: string | null, number: number): Promise<void> {
    if (previousKey) {
      try {
        await this.deps.storage.delete([previousKey]);
      } catch (error) {
        console.error('receipt.previous_delete_failed', { orderId, error: String(error) });
      }
    }
    try {
      const [order, presentation, checkout, contact, general] = await Promise.all([
        this.deps.orders.findById(orderId),
        loadOrderPresentation(this.deps.settings),
        this.deps.settings.get('checkout'),
        this.deps.settings.get('contact'),
        this.deps.settings.get('general'),
      ]);
      if (!order) return;
      await this.deps.notifications.notify({
        key: 'payment_receipt_store',
        // One alert per receipt: a second upload is a new message, because it is new information for the store.
        reference: `receipt:${order.paymentReceiptAt ?? ''}:${orderId}`,
        orderId,
        recipient: {
          email: checkout.orderNotificationEmail || contact.email,
          locale: general.defaultLocale,
        },
        context: orderSections(order, general.defaultLocale, {
          siteUrl: this.deps.siteUrl,
          presentation,
          accessKey: null,
        }),
      });
    } catch (error) {
      console.error('receipt.notify_failed', { orderId, number, error: String(error) });
    }
  }
}
