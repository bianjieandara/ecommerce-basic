// Ordering ports. Placing an order is one D1 batch: counter, order, items, stock and ledger succeed or fail together.
import type { OrderStatus } from '@/domain/ordering/order-status';
import type { ShippingKind } from '@/domain/ordering/shipping';
import type { CustomerDetails, Order, OrderItem } from '../dto/order-dto';
import type { StockChange } from './inventory';
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
  billing: Record<string, string>;
  /** Whether the buyer agreed to marketing at checkout (from the consent cookie). */
  marketingConsent: boolean;
  /** GA4 ids from the buyer's cookies. Null without marketing consent. */
  gaClientId: string | null;
  gaSessionId: string | null;
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

/** What a cancellation did: whether it applied, and the stock it gave back (empty when nothing changed). */
export interface CancelResult {
  cancelled: boolean;
  restored: StockChange[];
}

/** Persistence for orders. */
export interface OrderRepository {
  /**
   * Stores the order with its items, stock decrements and ledger rows in one batch. Throws OUT_OF_STOCK.
   * `stockChanges` are the decrements, so alerts can be evaluated for them.
   */
  place(draft: NewOrder): Promise<{ id: string; number: number; stockChanges: StockChange[] }>;
  findById(id: string): Promise<Order | null>;
  /** Several orders with their items in one read; an unknown id is missing from the result. */
  findByIds(ids: string[]): Promise<Order[]>;
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
   * `restored` lists the stock given back, so a restock can notify back-in-stock subscribers.
   */
  cancelAndReleaseStock(id: string, from: OrderStatus, event: NewOrderEvent): Promise<CancelResult>;
  /** Pending orders whose payment window has closed, oldest first. */
  listExpiredPending(nowIso: string, limit: number): Promise<string[]>;
  listEvents(orderId: string): Promise<OrderEvent[]>;
}

/** Checkout shipping methods. `position` orders the methods in the checkout list. */
export interface ShippingMethodRecord {
  id: string;
  kind: ShippingKind;
  name: { es: string; en: string };
  description: { es: string; en: string };
  priceMinor: number;
  freeOverMinor: number | null;
  isActive: boolean;
  position: number;
}

/** Persistence for shipping methods. */
export interface ShippingMethodRepository {
  listActive(): Promise<ShippingMethodRecord[]>;
  listAll(): Promise<ShippingMethodRecord[]>;
  save(method: ShippingMethodRecord): Promise<void>;
  /** Inserts the methods only when the table has none, in one statement, so two setups cannot both seed. */
  seedIfEmpty(methods: ShippingMethodRecord[]): Promise<void>;
  delete(id: string): Promise<void>;
}
