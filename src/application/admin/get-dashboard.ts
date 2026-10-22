// GetDashboard: the admin home. The two settings it needs are read once here and passed down, so the snapshot costs two settings reads.
import type { DashboardQueries, DashboardSnapshot } from '../ports/dashboard';
import type { SettingsRepository } from '../ports/content';
import type { Clock } from '../ports/platform';

/** Dependencies of GetDashboard. */
export interface GetDashboardDeps {
  settings: SettingsRepository;
  queries: DashboardQueries;
  clock: Clock;
}

/** Builds the admin home's numbers. */
export class GetDashboard {
  /** @param deps Settings, dashboard reads and the clock. */
  constructor(private readonly deps: GetDashboardDeps) {}

  /** @returns Everything the dashboard shows, for the current moment. */
  async execute(): Promise<DashboardSnapshot> {
    const [general, inventory] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('inventory'),
    ]);
    return this.deps.queries.snapshot({
      nowIso: this.deps.clock.now().toISOString(),
      timeZone: general.timezone,
      currency: general.currency,
      defaultLowStockThreshold: inventory.defaultLowStockThreshold,
    });
  }
}
