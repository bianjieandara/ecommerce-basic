// What each report reads and how it is built. A report reads its period and, when it compares periods, the period before it (in
// parallel); inventory is a snapshot and reads once. The registry is typed so every kind has exactly one definition.
import type { ReportFilters, ReportRange, ReportsQueryService, TrafficBreakdownSource } from './ports';
import type { ReportKind, ReportView } from './view';
import type { BuildContext } from './builders/shared';
import { buildCategories, buildInventory, buildProducts } from './builders/catalog-reports';
import { buildFunnel, buildNotifications } from './builders/ops-reports';
import { buildCustomers, buildPayments, buildShipping } from './builders/order-reports';
import { buildInvoices, buildSales, buildTaxes } from './builders/sales-reports';

/** Everything a definition needs to read and build one report. */
export interface RunEnv {
  queries: ReportsQueryService;
  traffic: TrafficBreakdownSource;
  timeZone: string;
  filters: ReportFilters;
  ctx: BuildContext;
}

/** Runs one report: reads and builds its view. */
export type ReportRunner = (env: RunEnv) => Promise<ReportView>;

/**
 * A report that reads a period (and the one before it, when it has one) and builds its view from both.
 * @param read Reads the rows of one period.
 * @param build Builds the view from the rows of this period and the one before.
 * @param periodic Whether the report compares with the previous period.
 * @returns The runner.
 */
function periodReport<T>(
  read: (env: RunEnv, range: ReportRange) => Promise<T>,
  build: (current: T, previous: T | null, env: RunEnv) => ReportView,
  periodic = true,
): ReportRunner {
  return async (env) => {
    const [current, previous] = await Promise.all([
      read(env, env.ctx.range),
      periodic && env.ctx.previous ? read(env, env.ctx.previous) : Promise.resolve(null),
    ]);
    return build(current, previous, env);
  };
}

/** Definition of every report, by kind. */
export const REPORT_RUNNERS: Record<ReportKind, ReportRunner> = {
  sales: periodReport(
    (env, range) => env.queries.sales(range, env.timeZone, env.filters),
    (current, previous, env) => buildSales(current, previous, env.ctx),
  ),
  products: periodReport(
    (env, range) => env.queries.products(range, env.timeZone, env.filters),
    (current, previous) => buildProducts(current, previous),
  ),
  categories: periodReport(
    (env, range) => env.queries.categories(range, env.timeZone, env.filters),
    (current, previous) => buildCategories(current, previous),
  ),
  payments: periodReport(
    (env, range) => env.queries.payments(range, env.timeZone, env.filters),
    (current, previous) => buildPayments(current, previous),
  ),
  shipping: periodReport(
    (env, range) => env.queries.shipping(range, env.timeZone, env.filters),
    (current, previous) => buildShipping(current, previous),
  ),
  taxes: periodReport(
    (env, range) => env.queries.taxes(range, env.timeZone, env.filters),
    (current, previous, env) => buildTaxes(current, previous, env.ctx),
  ),
  invoices: periodReport(
    (env, range) => env.queries.invoices(range, env.timeZone, env.filters),
    (current, previous) => buildInvoices(current, previous),
  ),
  // A snapshot: the valuation and the lists are as of now; only the movements follow the period.
  inventory: periodReport(
    (env, range) => env.queries.inventory(range, env.timeZone, env.filters),
    (current, _previous, env) => buildInventory(current, env.ctx),
    false,
  ),
  customers: periodReport(
    (env, range) => env.queries.customers(range, env.timeZone, env.filters),
    (current, previous) => buildCustomers(current, previous),
  ),
  funnel: async (env) => {
    const [current, previous, traffic] = await Promise.all([
      env.queries.funnel(env.ctx.range, env.timeZone, env.filters),
      env.ctx.previous
        ? env.queries.funnel(env.ctx.previous, env.timeZone, env.filters)
        : Promise.resolve(null),
      env.traffic.breakdowns(env.ctx.range, env.timeZone),
    ]);
    return buildFunnel(current, previous, env.ctx, traffic);
  },
  notifications: periodReport(
    (env, range) => env.queries.notifications(range, env.timeZone, env.filters),
    (current, previous) => buildNotifications(current, previous),
  ),
};

/** Reports whose time series can be grouped by day, week or month (their screens and CSV links carry the grouping). */
export const GRAIN_REPORTS: readonly ReportKind[] = ['sales', 'taxes', 'funnel'];
