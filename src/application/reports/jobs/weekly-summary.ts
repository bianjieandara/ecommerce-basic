// reports.weekly_summary: the store's key figures for the last seven full store-local days, with the top products and the stock
// that needs attention, sent as the weekly_report_store e-mail. Nothing is sent when the summary is off or the store has no
// address to send it to. The notification key holds the period, so a retried or repeated run sends one e-mail per period.
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/domain/shared/format';
import { money } from '@/domain/shared/money';
import { ADMIN_PATHS } from '@/domain/shared/paths';
import type { SettingsRepository } from '../../ports/content';
import type { Clock } from '../../ports/platform';
import type { NotificationService } from '../../notifications/notification-service';
import type { KpiRow } from '../../notifications/context';
import { absoluteUrl } from '../../documents/urls';
import { reportFilters } from '../filters';
import { localDay, previousRangeOf, rangeOf, shiftDay } from '../ranges';
import type { ReportsQueryService } from '../ports';
import { salesTotalsOf, type SalesTotals } from '../builders/sales-reports';
import { changeBp } from '../view';
import { weeklyLabels } from './weekly-labels';

/** Days the summary covers: the seven full days before today. */
const SUMMARY_DAYS = 7;

/** Products named in the summary. */
const TOP_PRODUCTS = 3;

/** Dependencies of WeeklySummary. */
export interface WeeklySummaryDeps {
  settings: SettingsRepository;
  queries: ReportsQueryService;
  notifications: NotificationService;
  clock: Clock;
  siteUrl: string;
}

/** Sends the weekly summary. */
export class WeeklySummary {
  /** @param deps Settings, reads, notifications, clock and the site URL. */
  constructor(private readonly deps: WeeklySummaryDeps) {}

  /**
   * @returns True when the e-mail was queued; false when the summary is off or there is nobody to send it to.
   */
  async execute(): Promise<boolean> {
    const [general, tax, inventory, reports, contact, checkout] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('tax'),
      this.deps.settings.get('inventory'),
      this.deps.settings.get('reports'),
      this.deps.settings.get('contact'),
      this.deps.settings.get('checkout'),
    ]);
    const recipient = checkout.orderNotificationEmail || contact.email;
    if (!reports.weeklySummaryEnabled || !recipient) return false;

    const now = this.deps.clock.now();
    const timeZone = general.timezone;
    const to = shiftDay(localDay(now.toISOString(), timeZone), -1);
    const range = rangeOf(shiftDay(to, -(SUMMARY_DAYS - 1)), to, timeZone);
    const previous = previousRangeOf(range, timeZone);
    const locale = general.defaultLocale;
    const filters = reportFilters({
      locale,
      grain: 'day',
      categoryId: null,
      series: null,
      tax,
      inventory,
      reports,
      now,
    });

    const [salesDays, previousDays, products, stock] = await Promise.all([
      this.deps.queries.sales(range, timeZone, filters),
      this.deps.queries.sales(previous, timeZone, filters),
      this.deps.queries.products(range, timeZone, filters),
      this.deps.queries.inventory(range, timeZone, filters),
    ]);
    const current = salesTotalsOf(salesDays);
    const before = salesTotalsOf(previousDays);
    const labels = weeklyLabels(locale);
    const format = (minor: number) => formatMoney(money(minor, general.currency), locale, general.country);
    const count = (value: number) => formatNumber(value, locale, general.country);
    const noChange = labels.noChange;
    const indicators: { label: string; raw: (t: SalesTotals) => number; show: (value: number) => string }[] =
      [
        { label: labels.revenue, raw: (t) => t.revenue, show: format },
        { label: labels.orders, raw: (t) => t.orders, show: count },
        { label: labels.averageOrder, raw: (t) => t.averageOrder, show: format },
        { label: labels.units, raw: (t) => t.units, show: count },
        { label: labels.refunds, raw: (t) => t.refunds, show: format },
      ];
    const kpis: KpiRow[] = indicators.map((indicator) => {
      const now = indicator.raw(current);
      const change = changeBp(now, indicator.raw(before));
      return {
        label: indicator.label,
        value: indicator.show(now),
        delta:
          change === null
            ? noChange
            : `${change > 0 ? '+' : ''}${formatPercent(change, locale, general.country)}`,
      };
    });
    products.byRevenue.slice(0, TOP_PRODUCTS).forEach((row, index) => {
      kpis.push({
        label: labels.topProduct.replace('{n}', String(index + 1)),
        value: `${row.name} · ${count(row.units)}`,
        delta: '',
      });
    });
    kpis.push({ label: labels.lowStock, value: count(stock.lowStockCount), delta: '' });
    kpis.push({ label: labels.outOfStock, value: count(stock.outOfStockCount), delta: '' });

    const period = `${formatDate(`${range.from}T12:00:00Z`, locale, general.country, timeZone)} – ${formatDate(`${range.to}T12:00:00Z`, locale, general.country, timeZone)}`;
    await this.deps.notifications.notify({
      key: 'weekly_report_store',
      reference: `weekly:${range.to}`,
      recipient: { email: recipient, locale },
      context: {
        report: { period, url: absoluteUrl(this.deps.siteUrl, ADMIN_PATHS.reports), kpis },
      },
    });
    return true;
  }
}
