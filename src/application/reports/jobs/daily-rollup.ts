// analytics.daily_rollup: writes the order counts of one store-local day (yesterday by default) into daily_metrics. The event
// counts (page views and the like) are written by the Stage 19 analytics rollup; this use case leaves those columns alone.
import type { SettingsRepository } from '../../ports/content';
import type { Clock } from '../../ports/platform';
import { localDay, rangeOf, shiftDay } from '../ranges';
import type { ReportMaintenance } from '../ports';

/** Dependencies of DailyRollup. */
export interface DailyRollupDeps {
  settings: SettingsRepository;
  maintenance: ReportMaintenance;
  clock: Clock;
}

/** Rolls the order counts of a store-local day into daily_metrics. Running it twice for one day sets the same values. */
export class DailyRollup {
  /** @param deps Settings, the maintenance writes and the clock. */
  constructor(private readonly deps: DailyRollupDeps) {}

  /**
   * @param requestedDay Day to roll up (YYYY-MM-DD), or null for yesterday in the store's time zone.
   * @returns The day that was written.
   */
  async execute(requestedDay: string | null): Promise<string> {
    const general = await this.deps.settings.get('general');
    const now = this.deps.clock.now();
    const day = requestedDay ?? shiftDay(localDay(now.toISOString(), general.timezone), -1);
    const range = rangeOf(day, day, general.timezone);
    await this.deps.maintenance.upsertDailyOrderCounts(day, range, now.toISOString());
    return day;
  }
}
