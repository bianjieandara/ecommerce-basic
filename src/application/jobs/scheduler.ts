// Cron scheduler. Cloudflare allows one cron expression per client, so this single tick decides which periodic
// jobs are due. Each periodic job is queued about once per period, using a KV marker as the guard (see onTick for the order).
import type { CacheStore, Clock } from '../ports/platform';
import type { JobQueue, JobType } from '../ports/jobs';
import type { SettingsRepository } from '../ports/content';
import { weeklySummaryDue } from '../reports/jobs/weekly-due';
import { demoResetDue } from '@/domain/demo/reset-schedule';

/** How long the once-a-day marker of the demo reset lives: a day and an hour, so the day's ticks all see it. */
const DAY_MARKER_SECONDS = 25 * 3600;

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
    private readonly deps: {
      jobs: JobQueue;
      cache: CacheStore;
      clock: Clock;
      settings: SettingsRepository;
      /** True only for the demo store: its sample data is restored once a day. */
      demoEnabled: boolean;
    },
  ) {}

  /**
   * Called on every cron tick.
   * Order expiry runs on every tick; the other jobs run once per period.
   *
   * A job is queued first and its marker written after. The other order loses the job when queuing fails: the marker would say
   * "done" and the job would wait a whole period (up to 24 hours). The cost of this order is that a marker write that fails right
   * after a successful queue lets the next tick queue the job again, which every periodic job tolerates: the rollup is an upsert,
   * the purge deletes what is already old, the review refresh overwrites its copy, the weekly summary is deduplicated by its
   * notification key, and the demo reset restores the same snapshot. Each job is attempted on its own, so one failure does not
   * hold back the others; the first failure is raised at the end so the tick is reported as failed.
   * @throws The first error of any job that could not be queued or marked.
   */
  async onTick(): Promise<void> {
    const now = this.deps.clock.now();
    const failures: unknown[] = [];
    const attempt = async (work: () => Promise<void>): Promise<void> => {
      try {
        await work();
      } catch (error) {
        failures.push(error);
      }
    };

    await attempt(() =>
      this.deps.jobs.enqueue(
        'orders.expire_stale',
        {},
        { idempotencyKey: `expire:${Math.floor(now.getTime() / 900_000)}` },
      ),
    );

    // The markers and the settings are independent reads, so they are read together; the writes follow, job by job.
    const due = PERIODIC_JOBS.map((job) => {
      const period = Math.floor(now.getTime() / (job.periodHours * 3_600_000));
      return { job, marker: `cron:${job.type}:${period}` };
    });
    await attempt(async () => {
      const [done, general, reports] = await Promise.all([
        Promise.all(due.map(({ marker }) => this.deps.cache.getJson<boolean>(marker))),
        this.deps.settings.get('general'),
        this.deps.settings.get('reports'),
      ]);
      for (const [index, { job, marker }] of due.entries()) {
        if (done[index]) continue;
        await attempt(async () => {
          await this.deps.jobs.enqueue(job.type, job.payload, { idempotencyKey: marker });
          await this.deps.cache.putJson(marker, true, job.periodHours * 3600 + MARKER_SLACK_SECONDS);
        });
      }

      // The weekly summary is due on one configured weekday and hour of the store's time zone; its key is that moment.
      const weeklyKey = weeklySummaryDue(reports, now.toISOString(), general.timezone);
      if (weeklyKey) {
        await attempt(() =>
          this.deps.jobs.enqueue('reports.weekly_summary', {}, { idempotencyKey: weeklyKey }),
        );
      }

      // The demo reset runs once per store-local day, after its hour; the marker keeps the day's later ticks from repeating it.
      const resetKey = demoResetDue(now.toISOString(), general.timezone, this.deps.demoEnabled);
      if (resetKey && !(await this.deps.cache.getJson<boolean>(resetKey))) {
        await attempt(async () => {
          await this.deps.jobs.enqueue('demo.reset', {}, { idempotencyKey: resetKey });
          await this.deps.cache.putJson(resetKey, true, DAY_MARKER_SECONDS);
        });
      }
    });

    if (failures.length > 0) throw failures[0];
  }
}
