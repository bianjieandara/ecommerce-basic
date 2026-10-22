// The filters every report read takes, built from the settings once. BuildReport and the weekly summary both use it, so the
// slow-mover window and the thresholds mean the same in a screen, a CSV file and an e-mail.
import type { SettingsMap } from '../content/settings-schemas';
import type { Locale } from '@/domain/shared/locale';
import type { Grain, ReportFilters } from './ports';

/** Milliseconds in a day, for the slow-mover window. */
const DAY_MS = 86_400_000;

/** Which settings and request values build the filters. */
export interface FilterInput {
  locale: Locale;
  grain: Grain;
  categoryId: string | null;
  series: string | null;
  tax: SettingsMap['tax'];
  inventory: SettingsMap['inventory'];
  reports: SettingsMap['reports'];
  now: Date;
}

/**
 * Builds the filters of a report read.
 * @param input Settings, request values and the current instant.
 * @returns The filters.
 */
export function reportFilters(input: FilterInput): ReportFilters {
  return {
    locale: input.locale,
    grain: input.grain,
    categoryId: input.categoryId,
    series: input.series,
    defaultRateBp: input.tax.defaultRateBp,
    defaultLowStockThreshold: input.inventory.defaultLowStockThreshold,
    slowMoverSinceIso: new Date(input.now.getTime() - input.reports.slowMoverDays * DAY_MS).toISOString(),
  };
}
