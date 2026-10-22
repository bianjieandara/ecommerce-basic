// maintenance.purge: deletes what the store no longer needs to show. Notification log rows older than 180 days and failed jobs
// resolved more than the configured number of days ago (90 by default). Unresolved failed jobs are never deleted.
import type { Clock } from '../../ports/platform';
import type { ReportMaintenance } from '../ports';

/** Days a notification log row is kept. */
export const NOTIFICATION_LOG_DAYS = 180;

/** Milliseconds in a day. */
const DAY_MS = 86_400_000;

/** Dependencies of PurgeOldRecords. */
export interface PurgeOldRecordsDeps {
  maintenance: ReportMaintenance;
  clock: Clock;
}

/** Removes old log rows and resolved failed jobs. */
export class PurgeOldRecords {
  /** @param deps The maintenance writes and the clock. */
  constructor(private readonly deps: PurgeOldRecordsDeps) {}

  /**
   * @param resolvedFailedJobsOlderThanDays Resolved failed jobs older than this many days are deleted.
   * @returns How many rows each delete removed.
   */
  async execute(
    resolvedFailedJobsOlderThanDays: number,
  ): Promise<{ notifications: number; failedJobs: number }> {
    const now = this.deps.clock.now().getTime();
    const notificationCutoff = new Date(now - NOTIFICATION_LOG_DAYS * DAY_MS).toISOString();
    const jobCutoff = new Date(now - resolvedFailedJobsOlderThanDays * DAY_MS).toISOString();
    // Sequential on purpose: each delete is one statement, and a failure of the first leaves the second to the next run.
    const notifications = await this.deps.maintenance.purgeNotificationLogBefore(notificationCutoff);
    const failedJobs = await this.deps.maintenance.purgeResolvedFailedJobsBefore(jobCutoff);
    return { notifications, failedJobs };
  }
}
