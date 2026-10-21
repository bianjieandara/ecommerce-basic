// Ordering ports. Placing an order is one D1 batch: stock, ledger, counter, order and items succeed or fail together.
import type { OrderStatus } from '@/domain/ordering/order-status';
import type { Order, OrderItem, CustomerDetails } from '../dto/order-dto';
import type { PaymentMethod } from './payments';
import type { StockChange } from './inventory';

/** Everything needed to insert a new order (computed by PlaceOrder before the batch). */
export interface NewOrder {
  id: string;
  accessKeyHash: string;
  status: 'pending_payment';
  paymentMethod: PaymentMethod;
  currency: Order['currency'];
  locale: Order['locale'];
  pricesIncludeTax: boolean;
  subtotalMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  customer: CustomerDetails;
  billing: Record<string, string>;
  shippingMethodId: string | null;
  shippingMethodName: string;
  shippingAddress: Record<string, string>;
  note: string;
  attribution: Record<string, string>;
  expiresAt: string | null;
  createdAt: string;
  items: (OrderItem & { imageMediaId: string | null })[];
}

/** Order fields that a status change may update. */
export interface OrderPatch {
  paymentReference?: string | null;
  paidAt?: string | null;
  trackingCode?: string | null;
}

/** Timeline entry written with every change. */
export interface NewOrderEvent {
  type: string;
  note?: string;
  actor: string;
}

/** Persistence for orders. */
export interface OrderRepository {
  place(draft: NewOrder): Promise<{ id: string; number: number; stockChanges: StockChange[] }>;
  findById(id: string): Promise<Order | null>;
  findByNumber(number: number): Promise<Order | null>;
  findByPaymentReference(method: PaymentMethod, reference: string): Promise<Order | null>;
  setPaymentReference(id: string, reference: string): Promise<void>;
  /** Changes status with its event. Callers must check the transition with assertTransition first. */
  transition(id: string, to: OrderStatus, event: NewOrderEvent, patch?: OrderPatch): Promise<void>;
  /** Cancels and restores stock once; repeated calls are no-ops (stock_released guards it). */
  cancelAndReleaseStock(id: string, event: NewOrderEvent): Promise<StockChange[]>;
  listExpiredPending(nowIso: string, limit: number): Promise<string[]>;
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
