// Dashboard reads: one snapshot of the numbers the admin home shows. Read-only, so it needs no use case of its own.
import type { CurrencyCode } from '@/domain/shared/currency';

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
  /** The last 14 store-local days, oldest first. Days without sales are present with zeros. */
  chart: DashboardDay[];
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
