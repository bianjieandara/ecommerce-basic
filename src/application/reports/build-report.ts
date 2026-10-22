// BuildReport: the one read path of the reports. The screens and the CSV files both call it, so a figure in a file is the figure
// on the screen. Settings are read once per call: the time zone, the currency and country, the default tax rate, the
// low-stock threshold and the slow-mover window.
import type { Locale } from '@/domain/shared/locale';
import { DomainError } from '@/domain/shared/errors';
import type { SettingsRepository } from '../ports/content';
import type { Clock } from '../ports/platform';
import type { CurrencyCode } from '@/domain/shared/currency';
import type { ReportFilters, ReportRange, ReportsQueryService, TrafficBreakdownSource } from './ports';
import { REPORT_RUNNERS, type RunEnv } from './report-definitions';
import { reportFilters } from './filters';
import { grainOf, localDay, previousRangeOf, rangeOf, resolveDays } from './ranges';
import type { ReportRequest } from './request';
import type { ReportKind, ReportView } from './view';
import { REPORT_KINDS } from './view';

/** Dependencies of BuildReport. */
export interface BuildReportDeps {
  settings: SettingsRepository;
  queries: ReportsQueryService;
  traffic: TrafficBreakdownSource;
  clock: Clock;
}

/** What a report page or a CSV file needs: the view and the settings it was formatted with. */
export interface ReportResult {
  kind: ReportKind;
  view: ReportView;
  range: ReportRange;
  /** The period before, the one the KPI cards compare with. */
  previous: ReportRange;
  /** The store-local day today; the page builds its shortcuts from it. */
  today: string;
  grain: ReportFilters['grain'];
  categoryId: string | null;
  series: string | null;
  timeZone: string;
  currency: CurrencyCode;
  country: string;
  locale: Locale;
}

/** Whether a value is a report kind. */
export function isReportKind(value: string): value is ReportKind {
  return (REPORT_KINDS as readonly string[]).includes(value);
}

/** Builds the reports. */
export class BuildReport {
  /** @param deps Settings, reads, the traffic hook and the clock. */
  constructor(private readonly deps: BuildReportDeps) {}

  /**
   * Reads and builds one report for a request.
   * @param kind The report.
   * @param request Raw parameters from the URL.
   * @param locale Language of the names and labels (the admin's language).
   * @returns The view and the settings it was built with.
   */
  async execute(kind: ReportKind, request: ReportRequest, locale: Locale): Promise<ReportResult> {
    if (!isReportKind(kind)) throw new DomainError('NOT_FOUND', 'Unknown report');
    const [general, tax, inventory, reports] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('tax'),
      this.deps.settings.get('inventory'),
      this.deps.settings.get('reports'),
    ]);
    const now = this.deps.clock.now();
    const timeZone = general.timezone;
    const today = localDay(now.toISOString(), timeZone);
    const days = resolveDays(request.from, request.to, today);
    const range = rangeOf(days.from, days.to, timeZone);
    const previous = previousRangeOf(range, timeZone);
    const grain = grainOf(request.grain);
    const categoryId = request.category;
    const series = request.series;
    const filters = reportFilters({ locale, grain, categoryId, series, tax, inventory, reports, now });
    const env: RunEnv = {
      queries: this.deps.queries,
      traffic: this.deps.traffic,
      timeZone,
      filters,
      ctx: { range, previous, filters, slowMoverDays: reports.slowMoverDays },
    };
    const view = await REPORT_RUNNERS[kind](env);
    return {
      kind,
      view,
      range,
      previous,
      today,
      grain,
      categoryId,
      series,
      timeZone,
      currency: general.currency,
      country: general.country,
      locale,
    };
  }
}
