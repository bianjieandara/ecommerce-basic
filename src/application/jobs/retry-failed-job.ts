// RetryFailedJob: runs a job that exhausted its retries again, through the queue. The job is resolved only after it was queued, so a
// failed enqueue leaves it open for another try. Handlers are idempotent, so a job that partly ran before is safe to run again.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../ports/identity';
import type { FailedJobRepository, JobQueue, JobType } from '../ports/jobs';
import type { Clock } from '../ports/platform';

/** Dependencies of RetryFailedJob. */
export interface RetryFailedJobDeps {
  failedJobs: FailedJobRepository;
  jobs: JobQueue;
  clock: Clock;
}

/** Re-queues a failed job. */
export class RetryFailedJob {
  /** @param deps Failed-job storage, the queue and the clock. */
  constructor(private readonly deps: RetryFailedJobDeps) {}

  /**
   * @param actor Signed-in admin. Only owners manage jobs.
   * @param jobId Failed job id.
   * @returns The type of the job that was queued again.
   * @throws DomainError FORBIDDEN, NOT_FOUND, or INVALID_STATE when the job was already resolved.
   */
  async execute(actor: AdminUser, jobId: string): Promise<{ type: JobType }> {
    if (!can(actor.role, 'jobs.manage')) throw new DomainError('FORBIDDEN', 'Only owners can retry jobs');
    const job = await this.deps.failedJobs.get(jobId);
    if (!job) throw new DomainError('NOT_FOUND', 'Job not found');
    if (job.resolvedAt) throw new DomainError('INVALID_STATE', 'This job was already resolved');
    await this.deps.jobs.enqueue(job.jobType, job.payload);
    await this.deps.failedJobs.resolve(job.id, 'retried', this.deps.clock.now().toISOString());
    return { type: job.jobType };
  }
}
