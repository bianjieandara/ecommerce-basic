// Dashboard reads: one snapshot of the numbers the admin home shows. Read-only, so it needs no use case of its own.
import type { CurrencyCode } from '@/domain/shared/currency';
import type { OrderStatus } from '@/domain/ordering/order-status';
import type { ReadinessStatus } from '@/domain/content/store-readiness';

/** Sales over one period. Revenue counts orders that were paid and are not refunded or cancelled. */
export interface PeriodKpis {
  placed: number;
  paidOrders: number;
  revenueMinor: number;
  taxMinor: number;
  averageOrderMinor: number;
}

/** One day of the chart, in the store's time zone. */
export interface DashboardDay {
  day: string;
  orders: number;
  revenueMinor: number;
}

/** A product in the top list over the last 30 days. */
export interface TopProduct {
  productId: string;
  name: string;
  units: number;
  revenueMinor: number;
}

/** One of the newest orders, for the "recent orders" table. */
export interface RecentOrder {
  number: number;
  customerName: string;
  totalMinor: number;
  currency: CurrencyCode;
  status: OrderStatus;
  createdAt: string;
}

/** Everything the dashboard shows. */
export interface DashboardSnapshot {
  currency: CurrencyCode;
  today: PeriodKpis;
  last7Days: PeriodKpis;
  last30Days: PeriodKpis;
  /** Paid orders that still need to be processed or shipped. */
  ordersToProcess: number;
  outOfStock: number;
  lowStock: number;
  failedNotifications: number;
  unresolvedJobs: number;
  topProducts: TopProduct[];
  /** The newest orders in any state, newest first. */
  recentOrders: RecentOrder[];
  /** The last 14 store-local days, oldest first. Days without sales are present with zeros. */
  chart: DashboardDay[];
  /** Counts the setup checklist needs (see store-readiness.ts). */
  readinessCounts: ReadinessCounts;
}

/** The database counts behind the setup checklist. */
export interface ReadinessCounts {
  activeProducts: number;
  activeShippingMethods: number;
  legalPagesSaved: number;
}

/** The dashboard as the page shows it: the snapshot plus the checklist, which also needs the store settings. */
export interface DashboardView extends Omit<DashboardSnapshot, 'readinessCounts'> {
  readiness: ReadinessStatus[];
}

/** Inputs the snapshot needs. Settings are read by the caller, once. */
export interface DashboardInput {
  nowIso: string;
  timeZone: string;
  currency: CurrencyCode;
  defaultLowStockThreshold: number;
}

/** Reads for the dashboard. */
export interface DashboardQueries {
  snapshot(input: DashboardInput): Promise<DashboardSnapshot>;
}
