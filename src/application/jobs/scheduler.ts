// Cron scheduler. Cloudflare allows one cron expression per client, so this single tick decides which periodic
// jobs are due. Each periodic job is enqueued at most once per period, using a KV marker as the guard.
import type { CacheStore, Clock } from '../ports/platform';
import type { JobQueue, JobType } from '../ports/jobs';
import type { SettingsRepository } from '../ports/content';
import { weeklySummaryDue } from '../reports/jobs/weekly-due';

/** A periodic job: how often it runs (in hours) and what it is called in the markers. */
interface PeriodicJob {
  type: JobType;
  periodHours: number;
  payload: unknown;
}

/** Jobs enqueued on a schedule. Every 15-minute tick runs `orders.expire_stale`; the rest run on their period. */
const PERIODIC_JOBS: PeriodicJob[] = [
  { type: 'reviews.refresh', periodHours: 6, payload: {} },
  { type: 'maintenance.purge', periodHours: 24, payload: {} },
  { type: 'analytics.daily_rollup', periodHours: 24, payload: {} },
];

/** Marker TTL: a little longer than the period, so a late tick still sees the marker. */
const MARKER_SLACK_SECONDS = 3600;

/** Schedules periodic work from the single cron tick. */
export class JobScheduler {
  /**
   * @param deps Queue, marker cache and clock.
   */
  constructor(
    private readonly deps: { jobs: JobQueue; cache: CacheStore; clock: Clock; settings: SettingsRepository },
  ) {}

  /**
   * Called on every cron tick.
   * Order expiry runs on every tick; the other jobs run once per period.
   */
  async onTick(): Promise<void> {
    const now = this.deps.clock.now();
    await this.deps.jobs.enqueue(
      'orders.expire_stale',
      {},
      { idempotencyKey: `expire:${Math.floor(now.getTime() / 900_000)}` },
    );

    for (const job of PERIODIC_JOBS) {
      const period = Math.floor(now.getTime() / (job.periodHours * 3_600_000));
      const marker = `cron:${job.type}:${period}`;
      if (await this.deps.cache.getJson<boolean>(marker)) continue;
      await this.deps.cache.putJson(marker, true, job.periodHours * 3600 + MARKER_SLACK_SECONDS);
      await this.deps.jobs.enqueue(job.type, job.payload, { idempotencyKey: marker });
    }

    // The weekly summary is due on one configured weekday and hour of the store's time zone; its key is that moment.
    const general = await this.deps.settings.get('general');
    const reports = await this.deps.settings.get('reports');
    const weeklyKey = weeklySummaryDue(reports, now.toISOString(), general.timezone);
    if (weeklyKey) await this.deps.jobs.enqueue('reports.weekly_summary', {}, { idempotencyKey: weeklyKey });
  }
}
