// Writes of the report jobs: the daily order counts and the purges of old logs. Only the jobs call these; no request does.
import type { ReportMaintenance } from '@/application/reports/ports';
import { statement } from './d1-client';
import { paidStatuses } from './reports-sql';

/** D1-backed maintenance writes for the report jobs. */
export class D1ReportMaintenance implements ReportMaintenance {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  /**
   * Sets the order counts of one day. One upsert: the counts are computed by subqueries, and an existing row keeps its
   * analytics columns (page views and the like), which the event stream writes.
   * @param day Store-local day, YYYY-MM-DD.
   * @param range Instants that bound the day.
   * @param nowIso Time of the write.
   */
  async upsertDailyOrderCounts(
    day: string,
    range: { startIso: string; endIso: string },
    nowIso: string,
  ): Promise<void> {
    const statuses = paidStatuses();
    const placeholders = statuses.sql;
    await statement(
      this.db,
      `INSERT INTO daily_metrics (day, orders_placed, orders_paid, revenue_minor, updated_at)
       VALUES (?,
         (SELECT COUNT(*) FROM orders WHERE created_at >= ? AND created_at < ?),
         (SELECT COUNT(*) FROM orders WHERE status IN ${placeholders} AND paid_at >= ? AND paid_at < ?),
         (SELECT COALESCE(SUM(total_minor), 0) FROM orders WHERE status IN ${placeholders} AND paid_at >= ? AND paid_at < ?),
         ?)
       ON CONFLICT (day) DO UPDATE SET orders_placed = excluded.orders_placed, orders_paid = excluded.orders_paid,
         revenue_minor = excluded.revenue_minor, updated_at = excluded.updated_at`,
      [
        day,
        range.startIso,
        range.endIso,
        ...statuses.binds,
        range.startIso,
        range.endIso,
        ...statuses.binds,
        range.startIso,
        range.endIso,
        nowIso,
      ],
    ).run();
  }

  /**
   * Deletes notification log rows created before the cutoff.
   * @param cutoffIso Rows older than this instant are deleted.
   * @returns How many rows were deleted.
   */
  async purgeNotificationLogBefore(cutoffIso: string): Promise<number> {
    const result = await statement(this.db, 'DELETE FROM notification_log WHERE created_at < ?', [
      cutoffIso,
    ]).run();
    return result.meta.changes;
  }

  /**
   * Deletes failed jobs that were resolved before the cutoff. Unresolved jobs are never deleted.
   * @param cutoffIso Jobs resolved before this instant are deleted.
   * @returns How many rows were deleted.
   */
  async purgeResolvedFailedJobsBefore(cutoffIso: string): Promise<number> {
    const result = await statement(
      this.db,
      'DELETE FROM failed_jobs WHERE resolved_at IS NOT NULL AND resolved_at < ?',
      [cutoffIso],
    ).run();
    return result.meta.changes;
  }
}
