// Ordering ports. Placing an order is one D1 batch: counter, order, items, stock and ledger succeed or fail together.
import type { OrderStatus } from '@/domain/ordering/order-status';
import type { CustomerDetails, Order, OrderItem } from '../dto/order-dto';
import type { PaymentMethod } from './payments';

/** Everything needed to insert a new order (computed by PlaceOrder before the batch). */
export interface NewOrder {
  id: string;
  accessKeyHash: string;
  paymentMethod: PaymentMethod;
  currency: Order['currency'];
  locale: Order['locale'];
  pricesIncludeTax: boolean;
  subtotalMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  customer: CustomerDetails;
  shippingMethodId: string | null;
  shippingMethodName: string;
  shippingAddress: Record<string, string>;
  note: string;
  attribution: Record<string, string>;
  expiresAt: string | null;
  createdAt: string;
  items: OrderItem[];
}

/** Order fields a status change may set. */
export interface OrderPatch {
  paymentReference?: string;
  paidAt?: string;
  trackingCode?: string;
}

/** A timeline entry written with a change. `at` is the time of the change, taken from the Clock port. */
export interface NewOrderEvent {
  type: string;
  note?: string;
  actor: string;
  at: string;
}

/** A timeline entry as stored. */
export interface OrderEvent {
  type: string;
  note: string | null;
  actor: string;
  createdAt: string;
}

/** Persistence for orders. */
export interface OrderRepository {
  /** Stores the order with its items, stock decrements and ledger rows in one batch. Throws OUT_OF_STOCK. */
  place(draft: NewOrder): Promise<{ id: string; number: number }>;
  findById(id: string): Promise<Order | null>;
  findByNumber(number: number): Promise<Order | null>;
  /** Id and access-key hash for an order number. Checked before anything else is loaded. */
  findAccessKeyHash(number: number): Promise<{ id: string; accessKeyHash: string } | null>;
  findByPaymentReference(method: PaymentMethod, reference: string): Promise<Order | null>;
  setPaymentReference(id: string, reference: string, nowIso: string): Promise<void>;
  /**
   * Moves an order from `from` to `to` together with its event. Returns false, and writes nothing, when the order is no
   * longer in `from`, so two competing changes cannot both apply.
   */
  transition(
    id: string,
    from: OrderStatus,
    to: OrderStatus,
    event: NewOrderEvent,
    patch?: OrderPatch,
  ): Promise<boolean>;
  /**
   * Cancels an order that is still in `from` and gives its stock back. stock_released makes a repeat a no-op.
   * Returns false when nothing changed.
   */
  cancelAndReleaseStock(id: string, from: OrderStatus, event: NewOrderEvent): Promise<boolean>;
  /** Pending orders whose payment window has closed, oldest first. */
  listExpiredPending(nowIso: string, limit: number): Promise<string[]>;
  listEvents(orderId: string): Promise<OrderEvent[]>;
}

/** Checkout shipping methods. */
export interface ShippingMethodRecord {
  id: string;
  kind: 'flat' | 'pickup';
  name: { es: string; en: string };
  description: { es: string; en: string };
  priceMinor: number;
  freeOverMinor: number | null;
  isActive: boolean;
}

/** Persistence for shipping methods. */
export interface ShippingMethodRepository {
  listActive(): Promise<ShippingMethodRecord[]>;
  listAll(): Promise<ShippingMethodRecord[]>;
  save(method: ShippingMethodRecord): Promise<void>;
  delete(id: string): Promise<void>;
}
