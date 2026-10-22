// Reports ports: the ranges and filters the reads take, the rows they return and the query service itself. Every read here is
// read-only; the maintenance and rollup writes sit in their own port at the bottom and are used by the jobs only.
import type { Locale } from '@/domain/shared/locale';
import type {
  CategoriesData,
  CustomersData,
  InventoryData,
  InvoiceSeriesRow,
  MetricsDay,
  NotificationRow,
  PaymentMethodRow,
  ProductsData,
  SalesDay,
  ShippingRow,
  TaxDay,
} from './report-rows';

/** Groupings of a time series. The closed set; forms and parsers derive from it. */
export const GRAINS = ['day', 'week', 'month'] as const;

/** One grouping of a time series: by store-local day, by week (starting Monday) or by month. */
export type Grain = (typeof GRAINS)[number];

/**
 * A period of store-local days. `from` and `to` are both included; the instants bound the same period in UTC, with `endIso`
 * exclusive, so queries compare instants without any time-zone arithmetic.
 */
export interface ReportRange {
  /** First store-local day, YYYY-MM-DD. */
  from: string;
  /** Last store-local day, YYYY-MM-DD. */
  to: string;
  /** Inclusive lower bound of the period, as an instant. */
  startIso: string;
  /** Exclusive upper bound of the period, as an instant. */
  endIso: string;
}

/**
 * Everything a report read may filter or label by. One object for every report, so each query method has the same
 * signature: (range, timeZone, filters). A read ignores the fields it does not use.
 */
export interface ReportFilters {
  /** Language of product, category and variant names. */
  locale: Locale;
  /** Grouping of the time series (sales, taxes, funnel). */
  grain: Grain;
  /** Only sales of products in this category, or null for all. */
  categoryId: string | null;
  /** Only invoices of this series, or null for all. */
  series: string | null;
  /** The store's default tax rate: shipping tax is shown at this rate, as on invoices. */
  defaultRateBp: number;
  /** Threshold used for variants without their own low-stock level. Whole units. */
  defaultLowStockThreshold: number;
  /** Variants with no sale paid after this instant are slow movers. */
  slowMoverSinceIso: string;
}

export type * from './report-rows';

/** Traffic breakdowns that only the event stream can give (Stage 19). Null until that stage provides them. */
export interface TrafficBreakdowns {
  topViewedProducts: { productId: string; views: number }[];
  byDevice: { label: string; count: number }[];
  byCountry: { label: string; count: number }[];
  byReferrer: { label: string; count: number }[];
}

/**
 * Hook for the Analytics Engine part of the funnel. The funnel report asks it for breakdowns the daily counts cannot give.
 * Stage 19 provides the implementation that reads the events dataset; until then the report says the data is pending.
 */
export interface TrafficBreakdownSource {
  /**
   * @param range Period of the report.
   * @param timeZone Store time zone.
   * @returns The breakdowns, or null when the event stream is not available.
   */
  breakdowns(range: ReportRange, timeZone: string): Promise<TrafficBreakdowns | null>;
}

/** Reads of the reports. Each method runs its statements in one batch and never writes. */
export interface ReportsQueryService {
  sales(range: ReportRange, timeZone: string, filters: ReportFilters): Promise<SalesDay[]>;
  taxes(range: ReportRange, timeZone: string, filters: ReportFilters): Promise<TaxDay[]>;
  products(range: ReportRange, timeZone: string, filters: ReportFilters): Promise<ProductsData>;
  categories(range: ReportRange, timeZone: string, filters: ReportFilters): Promise<CategoriesData>;
  payments(range: ReportRange, timeZone: string, filters: ReportFilters): Promise<PaymentMethodRow[]>;
  shipping(range: ReportRange, timeZone: string, filters: ReportFilters): Promise<ShippingRow[]>;
  invoices(range: ReportRange, timeZone: string, filters: ReportFilters): Promise<InvoiceSeriesRow[]>;
  inventory(range: ReportRange, timeZone: string, filters: ReportFilters): Promise<InventoryData>;
  customers(range: ReportRange, timeZone: string, filters: ReportFilters): Promise<CustomersData>;
  funnel(range: ReportRange, timeZone: string, filters: ReportFilters): Promise<MetricsDay[]>;
  notifications(range: ReportRange, timeZone: string, filters: ReportFilters): Promise<NotificationRow[]>;
}

/** Writes the jobs make to keep the reports fast and the tables small. Never used by a request. */
export interface ReportMaintenance {
  /** Daily rollup: sets the order counts of one day. Analytics counts are written by Stage 19 and left alone here. */
  upsertDailyOrderCounts(
    day: string,
    range: { startIso: string; endIso: string },
    nowIso: string,
  ): Promise<void>;
  /** Deletes notification log rows created before the cutoff. Returns how many were deleted. */
  purgeNotificationLogBefore(cutoffIso: string): Promise<number>;
  /** Deletes resolved failed jobs resolved before the cutoff. Unresolved jobs are never deleted. Returns how many were deleted. */
  purgeResolvedFailedJobsBefore(cutoffIso: string): Promise<number>;
}
