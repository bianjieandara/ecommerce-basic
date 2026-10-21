// Inventory ports. Every stock change goes through InventoryRepository.adjust, which writes the ledger row
// in the same D1 batch as the stock update, so the ledger always matches the stock.
import type { StockReason } from '@/domain/inventory/stock';

/** Result of one stock change: before and after values and the variant's alert threshold. */
export interface StockChange {
  variantId: string;
  productId: string;
  before: number;
  after: number;
  threshold: number;
}

/** One requested stock change. */
export interface StockDelta {
  variantId: string;
  delta: number;
  reason: StockReason;
  reference?: string;
  note?: string;
}

/** Stock and identity of one variant, for the inventory table and scanners. */
export interface InventoryRow {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  sku: string | null;
  barcode: string | null;
  stock: number;
  threshold: number;
  costMinor: number | null;
  priceMinor: number;
  trackInventory: boolean;
}

/** One ledger row. */
export interface StockMovement {
  id: string;
  variantId: string;
  productName: string;
  delta: number;
  stockAfter: number;
  reason: StockReason;
  reference: string | null;
  note: string | null;
  actor: string;
  createdAt: string;
}

/** Stock subscription ("notify me when back in stock"). */
export interface StockSubscription {
  id: string;
  variantId: string;
  email: string;
  phone: string | null;
  locale: 'es' | 'en';
  whatsappOptIn: boolean;
  notifiedAt: string | null;
}

/** Persistence for stock, the ledger and subscriptions. */
export interface InventoryRepository {
  /** Applies all deltas and their ledger rows in one batch. Throws OUT_OF_STOCK when stock would go negative. */
  adjust(changes: StockDelta[], actorId: string): Promise<StockChange[]>;
  findVariantByCode(code: string): Promise<InventoryRow | null>;
  listRows(filter: {
    search?: string;
    status?: 'in_stock' | 'low' | 'out' | 'untracked';
    page: number;
    pageSize: number;
  }): Promise<{ items: InventoryRow[]; total: number }>;
  listMovements(filter: {
    variantId?: string;
    reason?: StockReason;
    page: number;
    pageSize: number;
  }): Promise<{ items: StockMovement[]; total: number }>;
  addSubscription(subscription: Omit<StockSubscription, 'notifiedAt'> & { createdAt: string }): Promise<void>;
  listPendingSubscriptions(variantId: string): Promise<StockSubscription[]>;
  markSubscriptionsNotified(ids: string[], nowIso: string): Promise<void>;
}
