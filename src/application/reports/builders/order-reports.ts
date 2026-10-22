// Builders of the order reports: payment methods (paid, refunded and the conversion of placed orders), shipping methods, and
// customers (buyers, new against returning, the top customers and where they ship to).
import type { CustomersData, PaymentMethodRow, ShippingRow } from '../ports';
import type { ReportView } from '../view';
import { average, count, kpiFrom, money, rate, ratioBp, tableOf, text, viewOf } from './shared';

/** Totals of the payment rows. */
interface PaymentTotals {
  paidOrders: number;
  revenue: number;
  refunds: number;
  placed: number;
  converted: number;
  pending: number;
}

/**
 * Payment methods over the period. Money is by payment time; placed, converted and pending are by placement time.
 * @param rows One row per payment method.
 * @param previous Rows of the period before, or null.
 * @returns The view.
 */
export function buildPayments(rows: PaymentMethodRow[], previous: PaymentMethodRow[] | null): ReportView {
  const totalsOf = (list: PaymentMethodRow[]): PaymentTotals =>
    list.reduce(
      (acc, row) => ({
        paidOrders: acc.paidOrders + row.paidOrders,
        revenue: acc.revenue + row.revenueMinor,
        refunds: acc.refunds + row.refundedMinor,
        placed: acc.placed + row.placed,
        converted: acc.converted + row.converted,
        pending: acc.pending + row.pending,
      }),
      { paidOrders: 0, revenue: 0, refunds: 0, placed: 0, converted: 0, pending: 0 },
    );
  const now = totalsOf(rows);
  const before = previous ? totalsOf(previous) : null;
  const conversion = (t: PaymentTotals) => rate(ratioBp(t.converted, t.placed));
  return viewOf('payments', {
    kpis: [
      kpiFrom('kpi.revenue', now, before, (t) => money(t.revenue)),
      kpiFrom('kpi.paidOrders', now, before, (t) => count(t.paidOrders)),
      kpiFrom('kpi.refunds', now, before, (t) => money(t.refunds)),
      kpiFrom('kpi.placed', now, before, (t) => count(t.placed)),
      kpiFrom('kpi.conversion', now, before, conversion),
      kpiFrom('kpi.pending', now, before, (t) => count(t.pending)),
    ],
    chart: null,
    tables: [
      tableOf(
        'methods',
        'table.methods',
        [
          'col.method',
          'col.paidOrders',
          'col.revenue',
          'col.refunds',
          'col.placed',
          'col.converted',
          'col.pending',
          'col.conversion',
        ],
        rows.map((row) => [
          text(row.method),
          count(row.paidOrders),
          money(row.revenueMinor),
          money(row.refundedMinor),
          count(row.placed),
          count(row.converted),
          count(row.pending),
          rate(ratioBp(row.converted, row.placed)),
        ]),
      ),
    ],
    notes: [
      { key: 'notes.paidBasis', params: {} },
      { key: 'notes.placedBasis', params: {} },
    ],
  });
}

/**
 * Shipping methods over the period: income, paid orders and free shipments.
 * @param rows One row per method.
 * @param previous Rows of the period before, or null.
 * @returns The view.
 */
export function buildShipping(rows: ShippingRow[], previous: ShippingRow[] | null): ReportView {
  const totalsOf = (list: ShippingRow[]) => {
    const shipping = list.reduce((total, row) => total + row.shippingMinor, 0);
    const orders = list.reduce((total, row) => total + row.orders, 0);
    return {
      shipping,
      orders,
      free: list.reduce((total, row) => total + row.freeOrders, 0),
      average: average(shipping, orders),
    };
  };
  const now = totalsOf(rows);
  const before = previous ? totalsOf(previous) : null;
  return viewOf('shipping', {
    kpis: [
      kpiFrom('kpi.shipping', now, before, (t) => money(t.shipping)),
      kpiFrom('kpi.paidOrders', now, before, (t) => count(t.orders)),
      kpiFrom('kpi.freeOrders', now, before, (t) => count(t.free)),
      kpiFrom('kpi.averageShipping', now, before, (t) => money(t.average)),
    ],
    chart: null,
    tables: [
      tableOf(
        'shipping',
        'table.shippingMethods',
        ['col.method', 'col.paidOrders', 'col.shipping', 'col.freeOrders'],
        rows.map((row) => [
          text(row.name),
          count(row.orders),
          money(row.shippingMinor),
          count(row.freeOrders),
        ]),
      ),
    ],
    notes: [{ key: 'notes.paidBasis', params: {} }],
  });
}

/**
 * Customers over the period. A returning buyer is one whose first paid order is before the period.
 * @param data Customers data.
 * @param previous Customers data of the period before, or null.
 * @returns The view.
 */
export function buildCustomers(data: CustomersData, previous: CustomersData | null): ReportView {
  const figures = (d: CustomersData) => {
    const returning = d.buyers - d.newBuyers;
    return { buyers: d.buyers, newBuyers: d.newBuyers, returning, repeat: ratioBp(returning, d.buyers) };
  };
  const now = figures(data);
  const before = previous ? figures(previous) : null;
  return viewOf('customers', {
    kpis: [
      kpiFrom('kpi.buyers', now, before, (f) => count(f.buyers)),
      kpiFrom('kpi.newBuyers', now, before, (f) => count(f.newBuyers)),
      kpiFrom('kpi.returningBuyers', now, before, (f) => count(f.returning)),
      kpiFrom('kpi.repeatRate', now, before, (f) => rate(f.repeat)),
    ],
    chart: null,
    tables: [
      tableOf(
        'customers',
        'table.topCustomers',
        ['col.customer', 'col.email', 'col.orders', 'col.spent'],
        data.top.map((row) => [text(row.name), text(row.email), count(row.orders), money(row.spentMinor)]),
      ),
      tableOf(
        'countries',
        'table.countries',
        ['col.country', 'col.orders'],
        data.countries.map((row) => [text(row.country), count(row.orders)]),
      ),
      tableOf(
        'cities',
        'table.cities',
        ['col.city', 'col.country', 'col.orders'],
        data.cities.map((row) => [text(row.city), text(row.country), count(row.orders)]),
      ),
    ],
    notes: [{ key: 'notes.customers', params: {} }],
  });
}
