// Inventory ports. Every stock change goes through InventoryRepository.adjust, which writes each ledger row in the same D1
// batch as its stock update, so the ledger always matches the stock.
import type { StockReason, StockStatus } from '@/domain/inventory/stock';
import type { Locale } from '@/domain/shared/locale';
import type { Paginated } from '@/domain/shared/pagination';

/**
 * One stock change with the stock before and after it. `threshold` is the variant's own low-stock threshold; null means
 * the store default, which EvaluateStockChanges resolves from the inventory settings.
 */
export interface StockChange {
  variantId: string;
  productId: string;
  before: number;
  after: number;
  threshold: number | null;
}

/** One requested stock change. Rows with the same `reference` belong to one operation (an adjustment or an import). */
export interface StockDelta {
  variantId: string;
  delta: number;
  reason: StockReason;
  reference?: string;
  note?: string;
}

/** Who makes a batch of changes, and when. */
export interface AdjustContext {
  actorId: string;
  nowIso: string;
}

/** A variant as the inventory screens, the scanner and the alerts see it. */
export interface InventoryRow {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantLabel: string;
  sku: string | null;
  barcode: string | null;
  stock: number;
  /** Effective threshold: the variant's own, or the store default. */
  threshold: number;
  tracked: boolean;
  costMinor: number | null;
  /** Variant price, or the product's base price when the variant has none. */
  priceMinor: number;
  status: StockStatus;
  /** Storage key of the smallest image, for thumbnails; null when the variant has none. */
  thumbKey: string | null;
}

/** Filters and page of the inventory table. */
export interface InventoryFilter {
  search: string;
  categoryId: string | null;
  status: StockStatus | 'all';
  sort: 'name' | 'stock_asc' | 'stock_desc' | 'value_desc';
  locale: Locale;
  defaultThreshold: number;
  page: number;
  pageSize: number;
}

/** Totals above the inventory table. Every tracked variant counts, whether or not it is sellable right now. */
export interface InventoryTotals {
  units: number;
  costMinor: number;
  retailMinor: number;
}

/** One ledger row. */
export interface StockMovement {
  id: string;
  variantId: string;
  sku: string | null;
  productName: string;
  variantLabel: string;
  delta: number;
  stockAfter: number;
  reason: StockReason;
  reference: string | null;
  note: string | null;
  /** Admin name, or the raw actor for system and customer changes. */
  actor: string;
  createdAt: string;
}

/** Filters and page of the movement ledger. Dates are YYYY-MM-DD, both ends included. */
export interface MovementFilter {
  search: string;
  variantId: string | null;
  reason: StockReason | null;
  from: string | null;
  to: string | null;
  locale: Locale;
  page: number;
  pageSize: number;
}

/** A "notify me when back in stock" request, as stored. */
export interface StockSubscription {
  id: string;
  variantId: string;
  email: string;
  phone: string | null;
  locale: Locale;
  whatsappOptIn: boolean;
}

/** A subscription about to be stored. */
export interface NewStockSubscription extends StockSubscription {
  createdAt: string;
}

/** Writes stock, unit costs and subscriptions. Use cases read the variants they change through here as well. */
export interface InventoryRepository {
  /** Applies every change and its ledger row in one batch. Throws OUT_OF_STOCK when a stock would go below zero. */
  adjust(changes: StockDelta[], context: AdjustContext): Promise<StockChange[]>;
  /** Sets unit costs in minor units. A cost is not stock, so no ledger row is written. */
  setCosts(updates: { variantId: string; costMinor: number }[]): Promise<void>;
  findVariants(variantIds: string[], locale: Locale, defaultThreshold: number): Promise<InventoryRow[]>;
  /** Matches SKUs exactly. Unknown SKUs are missing from the result. */
  findVariantsBySku(skus: string[], locale: Locale, defaultThreshold: number): Promise<InventoryRow[]>;
  addSubscription(subscription: NewStockSubscription): Promise<void>;
  listPendingSubscriptions(variantId: string): Promise<StockSubscription[]>;
  markSubscriptionsNotified(ids: string[], nowIso: string): Promise<void>;
}

/** Reads for the inventory screens, the scanner and the ledger. */
export interface InventoryQueries {
  /** Matches a SKU or a barcode exactly. */
  findVariantByCode(code: string, locale: Locale, defaultThreshold: number): Promise<InventoryRow | null>;
  listRows(filter: InventoryFilter): Promise<Paginated<InventoryRow>>;
  totals(): Promise<InventoryTotals>;
  listMovements(filter: MovementFilter): Promise<Paginated<StockMovement>>;
}
