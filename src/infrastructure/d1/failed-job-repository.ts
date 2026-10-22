// Failed-job persistence: jobs that exhausted their retries, kept until an admin retries or discards them.
import type { FailedJob, FailedJobRepository } from '@/application/ports/jobs';
import type { JobEnvelope, JobType } from '@/application/ports/jobs';
import { parseJson, queryAll, queryFirst, statement } from './d1-client';

/** Row shape of failed_jobs. */
interface FailedJobRow {
  id: string;
  job_type: string;
  payload_json: string;
  error: string | null;
  attempts: number;
  created_at: string;
  resolved_at: string | null;
  resolution: 'retried' | 'discarded' | null;
}

/** Maps a row to the application shape. */
function toFailedJob(row: FailedJobRow): FailedJob {
  return {
    id: row.id,
    jobType: row.job_type as JobType,
    payload: parseJson<unknown>(row.payload_json, null),
    error: row.error,
    attempts: row.attempts,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolution: row.resolution,
  };
}

/** D1-backed failed-job repository. */
export class D1FailedJobRepository implements FailedJobRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async record(job: JobEnvelope, error: string): Promise<void> {
    await statement(
      this.db,
      `INSERT INTO failed_jobs (id, job_type, payload_json, error, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.type,
        JSON.stringify(job.payload ?? null),
        error.slice(0, 2000),
        job.attempts,
        new Date().toISOString(),
      ],
    ).run();
  }

  async list(page: number, pageSize: number): Promise<{ items: FailedJob[]; total: number }> {
    // The page and the count are independent, so one batch answers both.
    const results = await this.db.batch([
      statement(this.db, 'SELECT * FROM failed_jobs ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?', [
        pageSize,
        (page - 1) * pageSize,
      ]),
      statement(this.db, 'SELECT COUNT(*) AS n FROM failed_jobs'),
    ]);
    const rows = (results[0]?.results ?? []) as FailedJobRow[];
    const total = ((results[1]?.results ?? []) as { n: number }[])[0]?.n ?? 0;
    return { items: rows.map(toFailedJob), total };
  }

  async get(id: string): Promise<FailedJob | null> {
    const row = await queryFirst<FailedJobRow>(this.db, 'SELECT * FROM failed_jobs WHERE id = ?', [id]);
    return row ? toFailedJob(row) : null;
  }

  async resolve(id: string, resolution: 'retried' | 'discarded', nowIso: string): Promise<boolean> {
    // The guard keeps a job that is already resolved from being resolved again, for example by a second admin.
    const result = await statement(
      this.db,
      'UPDATE failed_jobs SET resolution = ?, resolved_at = ? WHERE id = ? AND resolved_at IS NULL',
      [resolution, nowIso, id],
    ).run();
    return result.meta.changes > 0;
  }

  async findUnresolvedByNotificationKey(idempotencyKey: string): Promise<FailedJob[]> {
    const rows = await queryAll<FailedJobRow>(
      this.db,
      `SELECT * FROM failed_jobs
       WHERE job_type = 'notify.email' AND resolved_at IS NULL AND json_extract(payload_json, '$.idempotencyKey') = ?
       ORDER BY created_at ASC, id ASC`,
      [idempotencyKey],
    );
    return rows.map(toFailedJob);
  }

  /**
   * Deletes resolved failed jobs older than a cutoff. Unresolved jobs are never deleted.
   * @param cutoffIso Resolved jobs resolved before this instant are removed.
   * @returns Nothing; the number of deleted rows is not needed by callers.
   */
  async purgeResolvedBefore(cutoffIso: string): Promise<void> {
    await statement(this.db, 'DELETE FROM failed_jobs WHERE resolved_at IS NOT NULL AND resolved_at < ?', [
      cutoffIso,
    ]).run();
  }
}
