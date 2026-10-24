// Job ports. Slow, external or retryable work is enqueued here and executed by the queue consumer.
// The payload types for each job are declared in application/jobs/job-types.ts (zod schemas).

/** Every job the system runs. Names are namespaced by area. */
export type JobType =
  | 'notify.email'
  | 'notify.whatsapp'
  | 'invoice.issue'
  | 'invoice.render_pdf'
  | 'invoice.legal_issue'
  | 'marketing.meta_capi'
  | 'marketing.ga4_purchase'
  | 'inventory.low_stock_alert'
  | 'inventory.back_in_stock'
  | 'orders.expire_stale'
  | 'reviews.refresh'
  | 'reports.weekly_summary'
  | 'analytics.daily_rollup'
  | 'maintenance.purge';

/** What a job needs to run. `idempotencyKey` makes a retried job safe to run again. */
export interface JobEnvelope {
  id: string;
  type: JobType;
  payload: unknown;
  idempotencyKey: string;
  createdAt: string;
  /** Delivery attempts so far, filled by the queue. */
  attempts: number;
}

/** Options when enqueueing a job. */
export interface EnqueueOptions {
  delaySeconds?: number;
  idempotencyKey?: string;
}

/** Puts jobs on the queue. */
export interface JobQueue {
  enqueue(type: JobType, payload: unknown, options?: EnqueueOptions): Promise<void>;
  enqueueMany(jobs: { type: JobType; payload: unknown; options?: EnqueueOptions }[]): Promise<void>;
}

/** How many jobs wait in the queue. Null when the platform does not report it, as the local runtime does not. */
export interface QueueBacklog {
  count(): Promise<number | null>;
}

/** A job that exhausted its retries. */
export interface FailedJob {
  id: string;
  jobType: JobType;
  payload: unknown;
  error: string | null;
  attempts: number;
  createdAt: string;
  resolvedAt: string | null;
  resolution: 'retried' | 'discarded' | null;
}

/** Storage for jobs that failed permanently, so an admin can retry or discard them. */
export interface FailedJobRepository {
  record(job: JobEnvelope, error: string): Promise<void>;
  list(page: number, pageSize: number): Promise<{ items: FailedJob[]; total: number }>;
  get(id: string): Promise<FailedJob | null>;
  /** Marks an unresolved job. Returns false, and changes nothing, when the job was already resolved. */
  resolve(id: string, resolution: 'retried' | 'discarded', nowIso: string): Promise<boolean>;
  /** Resolves several unresolved jobs in one statement. Returns how many changed; already resolved jobs are left alone. */
  resolveMany(ids: string[], resolution: 'retried' | 'discarded', nowIso: string): Promise<number>;
  /** Unresolved e-mail jobs for one notification, oldest first. */
  findUnresolvedByNotificationKey(idempotencyKey: string): Promise<FailedJob[]>;
  /** Deletes resolved jobs resolved before the cutoff. Unresolved jobs are never deleted. */
  purgeResolvedBefore(cutoffIso: string): Promise<void>;
}
