// The view model every report renders with one component: KPI cards, an optional chart, tables and notes. Labels are i18n keys
// under admin.reports (the UI translates them); amounts stay in minor units and are formatted by the UI.

/** Every report, the closed set. The route, the CSV endpoint and the tabs derive from it. */
export const REPORT_KINDS = [
  'sales',
  'products',
  'categories',
  'payments',
  'shipping',
  'taxes',
  'invoices',
  'inventory',
  'customers',
  'funnel',
  'notifications',
] as const;

/** One report. */
export type ReportKind = (typeof REPORT_KINDS)[number];

/**
 * Every i18n key a report view names, relative to admin.reports. A key that is not listed here cannot reach the UI, so the
 * dictionaries and the views cannot drift apart.
 */
export const REPORT_TEXT_KEYS = [
  'title',
  'kinds.sales',
  'kinds.products',
  'kinds.categories',
  'kinds.payments',
  'kinds.shipping',
  'kinds.taxes',
  'kinds.invoices',
  'kinds.inventory',
  'kinds.customers',
  'kinds.funnel',
  'kinds.notifications',
  'range.from',
  'range.to',
  'range.apply',
  'range.last7',
  'range.last30',
  'range.last90',
  'grain.label',
  'grain.day',
  'grain.week',
  'grain.month',
  'csv',
  'vsPrevious',
  'changeNone',
  'emptyTable',
  'truncated',
  'notes.paidBasis',
  'notes.placedBasis',
  'notes.categoryMulti',
  'notes.costMissing',
  'notes.dailyMetrics',
  'notes.notifications',
  'notes.inventory',
  'notes.slowMovers',
  'notes.taxShipping',
  'notes.customers',
  'notes.analytics',
  'chart.revenue',
  'chart.orders',
  'kpi.revenue',
  'kpi.orders',
  'kpi.averageOrder',
  'kpi.units',
  'kpi.tax',
  'kpi.shipping',
  'kpi.refunds',
  'kpi.productsSold',
  'kpi.margin',
  'kpi.marginRate',
  'kpi.paidOrders',
  'kpi.placed',
  'kpi.conversion',
  'kpi.pending',
  'kpi.freeOrders',
  'kpi.averageShipping',
  'kpi.base',
  'kpi.issued',
  'kpi.void',
  'kpi.issuedTotal',
  'kpi.voidTotal',
  'kpi.unitsOnHand',
  'kpi.valueCost',
  'kpi.valueRetail',
  'kpi.outOfStock',
  'kpi.lowStock',
  'kpi.slowMovers',
  'kpi.buyers',
  'kpi.newBuyers',
  'kpi.returningBuyers',
  'kpi.repeatRate',
  'kpi.pageViews',
  'kpi.productViews',
  'kpi.addToCarts',
  'kpi.checkouts',
  'kpi.ordersPaid',
  'kpi.conversionRate',
  'kpi.sent',
  'kpi.failed',
  'kpi.failureRate',
  'table.periods',
  'table.byUnits',
  'table.byRevenue',
  'table.variants',
  'table.categories',
  'table.methods',
  'table.shippingMethods',
  'table.taxes',
  'table.series',
  'table.lowStock',
  'table.outOfStock',
  'table.slowMovers',
  'table.movements',
  'table.topCustomers',
  'table.countries',
  'table.cities',
  'table.funnel',
  'table.notifications',
  'table.traffic',
  'col.group',
  'col.label',
  'col.count',
  'col.period',
  'col.orders',
  'col.units',
  'col.revenue',
  'col.tax',
  'col.shipping',
  'col.refunds',
  'col.product',
  'col.variant',
  'col.sku',
  'col.cost',
  'col.margin',
  'col.marginRate',
  'col.category',
  'col.method',
  'col.paidOrders',
  'col.placed',
  'col.converted',
  'col.pending',
  'col.conversion',
  'col.freeOrders',
  'col.rate',
  'col.base',
  'col.series',
  'col.issued',
  'col.void',
  'col.issuedTotal',
  'col.voidTotal',
  'col.stock',
  'col.threshold',
  'col.valueCost',
  'col.reason',
  'col.movements',
  'col.unitsIn',
  'col.unitsOut',
  'col.customer',
  'col.email',
  'col.spent',
  'col.country',
  'col.city',
  'col.pageViews',
  'col.productViews',
  'col.addToCarts',
  'col.checkouts',
  'col.ordersPlaced',
  'col.ordersPaid',
  'col.channel',
  'col.template',
  'col.sent',
  'col.delivered',
  'col.read',
  'col.failed',
] as const;

/** An i18n key of a report view, relative to admin.reports. */
export type ReportTextKey = (typeof REPORT_TEXT_KEYS)[number];

/**
 * One value in a KPI or a table. Money stays in minor units; percentages in basis points; days as YYYY-MM-DD. The UI formats
 * each kind in the store's locale and currency, so a CSV and a screen show the same figure.
 */
export type CellValue =
  | { kind: 'money'; minor: number }
  | { kind: 'count'; value: number }
  | { kind: 'bp'; value: number }
  | { kind: 'text'; value: string }
  | { kind: 'day'; value: string }
  | { kind: 'empty' };

/** A KPI card. `changeBp` is the change against the previous period, or null when there is nothing to compare. */
export interface ReportKpi {
  label: ReportTextKey;
  value: CellValue;
  previous: CellValue | null;
  changeBp: number | null;
}

/** The chart of a report: one point per bucket, oldest first. */
export interface ReportChart {
  title: ReportTextKey;
  unit: 'money' | 'count';
  points: { label: string; value: number }[];
}

/** A note under the report. `params` fill its {placeholders}. */
export interface ReportNote {
  key: ReportTextKey;
  params: Record<string, number>;
}

/**
 * A table. `id` names it in the CSV link; `columns` are translated headers, in the order of each row's cells. `total` counts
 * every matching row; `rows` holds the first ones, so a longer `total` means the list was cut short.
 */
export interface ReportTable {
  id: string;
  title: ReportTextKey;
  columns: ReportTextKey[];
  rows: CellValue[][];
  total: number;
}

/** What one report shows. */
export interface ReportView {
  kind: ReportKind;
  kpis: ReportKpi[];
  chart: ReportChart | null;
  tables: ReportTable[];
  notes: ReportNote[];
}

/**
 * Change between two values, in basis points, rounded half up. Null when the previous value is zero, because a change from
 * nothing has no percentage.
 * @param current Value of the period.
 * @param previous Value of the period before.
 * @returns The change in basis points (1250 = +12.5%), or null.
 */
export function changeBp(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) * 10_000) / Math.abs(previous));
}
