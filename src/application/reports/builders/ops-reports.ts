// Builders of the funnel (daily counts from the rollup) and the notification log. The funnel's traffic breakdowns come from the
// event stream: until Stage 19 provides them, the view says so instead of showing an empty table.
import type { MetricsDay, NotificationRow, TrafficBreakdowns } from '../ports';
import type { ReportTable, ReportView } from '../view';
import {
  count,
  kpiFrom,
  money,
  rate,
  ratioBp,
  seriesOf,
  tableOf,
  text,
  viewOf,
  day,
  type BuildContext,
} from './shared';

/** Totals of the daily counts of a period. */
interface FunnelTotals {
  pageViews: number;
  productViews: number;
  addToCarts: number;
  checkouts: number;
  ordersPaid: number;
}

/**
 * Sums the daily counts of a period.
 * @param days Daily rows.
 * @returns The totals.
 */
function funnelTotals(days: MetricsDay[]): FunnelTotals {
  const sum = (pick: (d: MetricsDay) => number) => days.reduce((total, d) => total + pick(d), 0);
  return {
    pageViews: sum((d) => d.pageViews),
    productViews: sum((d) => d.productViews),
    addToCarts: sum((d) => d.addToCarts),
    checkouts: sum((d) => d.checkoutsStarted),
    ordersPaid: sum((d) => d.ordersPaid),
  };
}

/**
 * The funnel: page views, product views, carts, checkouts and paid orders, by day, week or month; the chart is the paid orders.
 * @param current Daily rows of the period.
 * @param previous Daily rows of the period before, or null.
 * @param ctx Build context (range and grouping).
 * @param traffic Traffic breakdowns, or null when the event stream is not available yet.
 * @returns The view.
 */
export function buildFunnel(
  current: MetricsDay[],
  previous: MetricsDay[] | null,
  ctx: BuildContext,
  traffic: TrafficBreakdowns | null,
): ReportView {
  const now = funnelTotals(current);
  const before = previous ? funnelTotals(previous) : null;
  const series = seriesOf(
    ctx.range,
    ctx.filters.grain,
    current,
    () => ({
      pageViews: 0,
      productViews: 0,
      addToCarts: 0,
      checkouts: 0,
      ordersPlaced: 0,
      ordersPaid: 0,
      revenue: 0,
    }),
    (acc, row) => {
      acc.pageViews += row.pageViews;
      acc.productViews += row.productViews;
      acc.addToCarts += row.addToCarts;
      acc.checkouts += row.checkoutsStarted;
      acc.ordersPlaced += row.ordersPlaced;
      acc.ordersPaid += row.ordersPaid;
      acc.revenue += row.revenueMinor;
    },
  );
  const tables: ReportTable[] = [
    tableOf(
      'funnel',
      'table.funnel',
      [
        'col.period',
        'col.pageViews',
        'col.productViews',
        'col.addToCarts',
        'col.checkouts',
        'col.ordersPlaced',
        'col.ordersPaid',
        'col.revenue',
      ],
      [...series].map(([bucket, acc]) => [
        day(bucket),
        count(acc.pageViews),
        count(acc.productViews),
        count(acc.addToCarts),
        count(acc.checkouts),
        count(acc.ordersPlaced),
        count(acc.ordersPaid),
        money(acc.revenue),
      ]),
    ),
  ];
  if (traffic) {
    tables.push(
      tableOf(
        'traffic',
        'table.traffic',
        ['col.group', 'col.label', 'col.count'],
        [
          ...traffic.topViewedProducts.map((row) => [text('product'), text(row.productId), count(row.views)]),
          ...traffic.byDevice.map((row) => [text('device'), text(row.label), count(row.count)]),
          ...traffic.byCountry.map((row) => [text('country'), text(row.label), count(row.count)]),
          ...traffic.byReferrer.map((row) => [text('referrer'), text(row.label), count(row.count)]),
        ],
      ),
    );
  }
  return viewOf('funnel', {
    kpis: [
      kpiFrom('kpi.pageViews', now, before, (t) => count(t.pageViews)),
      kpiFrom('kpi.productViews', now, before, (t) => count(t.productViews)),
      kpiFrom('kpi.addToCarts', now, before, (t) => count(t.addToCarts)),
      kpiFrom('kpi.checkouts', now, before, (t) => count(t.checkouts)),
      kpiFrom('kpi.ordersPaid', now, before, (t) => count(t.ordersPaid)),
      kpiFrom('kpi.conversionRate', now, before, (t) => rate(ratioBp(t.ordersPaid, t.pageViews))),
    ],
    chart: {
      title: 'chart.orders',
      unit: 'count',
      points: [...series].map(([bucket, acc]) => ({ label: bucket, value: acc.ordersPaid })),
    },
    tables,
    notes: [
      { key: 'notes.dailyMetrics', params: {} },
      ...(traffic === null ? [{ key: 'notes.analytics' as const, params: {} }] : []),
    ],
  });
}

/** Totals of the notification rows. */
interface NotificationTotals {
  sent: number;
  failed: number;
}

/**
 * Notifications of the period: messages sent and failed, by channel and template.
 * @param rows One row per channel and template.
 * @param previous Rows of the period before, or null.
 * @returns The view.
 */
export function buildNotifications(rows: NotificationRow[], previous: NotificationRow[] | null): ReportView {
  const totalsOf = (list: NotificationRow[]): NotificationTotals => ({
    sent: list.reduce((total, row) => total + row.sent, 0),
    failed: list.reduce((total, row) => total + row.failed, 0),
  });
  const now = totalsOf(rows);
  const before = previous ? totalsOf(previous) : null;
  return viewOf('notifications', {
    kpis: [
      kpiFrom('kpi.sent', now, before, (t) => count(t.sent)),
      kpiFrom('kpi.failed', now, before, (t) => count(t.failed)),
      kpiFrom('kpi.failureRate', now, before, (t) => rate(ratioBp(t.failed, t.sent + t.failed))),
    ],
    chart: null,
    tables: [
      tableOf(
        'notifications',
        'table.notifications',
        ['col.channel', 'col.template', 'col.sent', 'col.delivered', 'col.read', 'col.failed'],
        rows.map((row) => [
          text(row.channel),
          text(row.template),
          count(row.sent),
          count(row.delivered),
          count(row.read),
          count(row.failed),
        ]),
      ),
    ],
    notes: [{ key: 'notes.notifications', params: {} }],
  });
}
