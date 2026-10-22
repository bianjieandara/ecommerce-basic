// Builders of the money reports: sales, taxes and invoices. Each turns the rows of its read into KPI cards, a chart where one
// fits, and the tables the CSV exports.
import { bucketOf } from '../ranges';
import type { InvoiceSeriesRow, SalesDay, TaxDay } from '../ports';
import type { ReportView } from '../view';
import {
  average,
  count,
  day,
  kpiFrom,
  money,
  rate,
  seriesOf,
  tableOf,
  text,
  viewOf,
  type BuildContext,
} from './shared';

/** Totals of the sales days of a period. */
export interface SalesTotals {
  orders: number;
  units: number;
  revenue: number;
  tax: number;
  shipping: number;
  refundOrders: number;
  refunds: number;
  averageOrder: number;
}

/**
 * Sums the sales days of a period (the totals the KPI cards and the weekly e-mail show).
 * @param days Sales days.
 * @returns The totals.
 */
export function salesTotalsOf(days: SalesDay[]): SalesTotals {
  const sum = (pick: (d: SalesDay) => number) => days.reduce((total, d) => total + pick(d), 0);
  const orders = sum((d) => d.orders);
  const revenue = sum((d) => d.revenueMinor);
  return {
    orders,
    units: sum((d) => d.units),
    revenue,
    tax: sum((d) => d.taxMinor),
    shipping: sum((d) => d.shippingMinor),
    refundOrders: sum((d) => d.refundOrders),
    refunds: sum((d) => d.refundMinor),
    averageOrder: average(revenue, orders),
  };
}

/**
 * Sales: revenue, orders, average order value, units, tax, shipping and refunds, by day, week or month.
 * @param current Sales days of the period.
 * @param previous Sales days of the period before, or null.
 * @param ctx Build context (range and grouping).
 * @returns The view.
 */
export function buildSales(current: SalesDay[], previous: SalesDay[] | null, ctx: BuildContext): ReportView {
  const now = salesTotalsOf(current);
  const before = previous ? salesTotalsOf(previous) : null;
  const series = seriesOf(
    ctx.range,
    ctx.filters.grain,
    current,
    () => ({ orders: 0, units: 0, revenue: 0, tax: 0, shipping: 0, refunds: 0 }),
    (acc, row) => {
      acc.orders += row.orders;
      acc.units += row.units;
      acc.revenue += row.revenueMinor;
      acc.tax += row.taxMinor;
      acc.shipping += row.shippingMinor;
      acc.refunds += row.refundMinor;
    },
  );
  const rows = [...series].map(([bucket, acc]) => [
    day(bucket),
    count(acc.orders),
    count(acc.units),
    money(acc.revenue),
    money(acc.tax),
    money(acc.shipping),
    money(acc.refunds),
  ]);
  return viewOf('sales', {
    kpis: [
      kpiFrom('kpi.revenue', now, before, (t) => money(t.revenue)),
      kpiFrom('kpi.orders', now, before, (t) => count(t.orders)),
      kpiFrom('kpi.averageOrder', now, before, (t) => money(t.averageOrder)),
      kpiFrom('kpi.units', now, before, (t) => count(t.units)),
      kpiFrom('kpi.tax', now, before, (t) => money(t.tax)),
      kpiFrom('kpi.shipping', now, before, (t) => money(t.shipping)),
      kpiFrom('kpi.refunds', now, before, (t) => money(t.refunds)),
    ],
    chart: {
      title: 'chart.revenue',
      unit: 'money',
      points: [...series].map(([bucket, acc]) => ({ label: bucket, value: acc.revenue })),
    },
    tables: [
      tableOf(
        'periods',
        'table.periods',
        ['col.period', 'col.orders', 'col.units', 'col.revenue', 'col.tax', 'col.shipping', 'col.refunds'],
        rows,
      ),
    ],
    notes: [{ key: 'notes.paidBasis', params: {} }],
  });
}

/** Totals of the tax rows of a period. */
interface TaxTotals {
  base: number;
  tax: number;
}

/**
 * Tax of a period: base and tax per rate, by day, week or month.
 * @param current Tax days of the period.
 * @param previous Tax days of the period before, or null.
 * @param ctx Build context.
 * @returns The view.
 */
export function buildTaxes(current: TaxDay[], previous: TaxDay[] | null, ctx: BuildContext): ReportView {
  const totalsFor = (rows: TaxDay[]): TaxTotals => ({
    base: rows.reduce((total, row) => total + row.baseMinor, 0),
    tax: rows.reduce((total, row) => total + row.taxMinor, 0),
  });
  const now = totalsFor(current);
  const before = previous ? totalsFor(previous) : null;
  // Rows per bucket and rate: the same day can carry several rates, so each rate is its own accumulator.
  const byRate = new Map<string, { bucket: string; rate: number; base: number; tax: number }>();
  for (const row of current) {
    const bucket = bucketOf(row.day, ctx.filters.grain);
    const key = `${bucket}|${row.rateBp}`;
    const acc = byRate.get(key) ?? { bucket, rate: row.rateBp, base: 0, tax: 0 };
    acc.base += row.baseMinor;
    acc.tax += row.taxMinor;
    byRate.set(key, acc);
  }
  const rows = [...byRate.values()]
    .sort((a, b) => (a.bucket === b.bucket ? a.rate - b.rate : a.bucket < b.bucket ? -1 : 1))
    .map((acc) => [day(acc.bucket), rate(acc.rate), money(acc.base), money(acc.tax)]);
  return viewOf('taxes', {
    kpis: [
      kpiFrom('kpi.base', now, before, (t) => money(t.base)),
      kpiFrom('kpi.tax', now, before, (t) => money(t.tax)),
    ],
    chart: null,
    tables: [tableOf('taxes', 'table.taxes', ['col.period', 'col.rate', 'col.base', 'col.tax'], rows)],
    notes: [
      { key: 'notes.taxShipping', params: {} },
      { key: 'notes.paidBasis', params: {} },
    ],
  });
}

/**
 * Invoices by series: issued and void counts and totals, and the tax of the issued ones.
 * @param rows One row per series.
 * @returns The view.
 */
export function buildInvoices(rows: InvoiceSeriesRow[], previous: InvoiceSeriesRow[] | null): ReportView {
  const totalsOf = (list: InvoiceSeriesRow[]) =>
    list.reduce(
      (acc, row) => ({
        issued: acc.issued + row.issued,
        void: acc.void + row.void,
        issuedMinor: acc.issuedMinor + row.issuedMinor,
        voidMinor: acc.voidMinor + row.voidMinor,
      }),
      { issued: 0, void: 0, issuedMinor: 0, voidMinor: 0 },
    );
  const totals = totalsOf(rows);
  const before = previous ? totalsOf(previous) : null;
  return viewOf('invoices', {
    kpis: [
      kpiFrom('kpi.issued', totals, before, (t) => count(t.issued)),
      kpiFrom('kpi.void', totals, before, (t) => count(t.void)),
      kpiFrom('kpi.issuedTotal', totals, before, (t) => money(t.issuedMinor)),
      kpiFrom('kpi.voidTotal', totals, before, (t) => money(t.voidMinor)),
    ],
    chart: null,
    tables: [
      tableOf(
        'series',
        'table.series',
        ['col.series', 'col.issued', 'col.void', 'col.issuedTotal', 'col.voidTotal', 'col.tax'],
        rows.map((row) => [
          text(row.series),
          count(row.issued),
          count(row.void),
          money(row.issuedMinor),
          money(row.voidMinor),
          money(row.taxMinor),
        ]),
      ),
    ],
    notes: [],
  });
}
