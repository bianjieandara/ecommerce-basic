// DiscardFailedJob: gives up on a failed job. It stays in the table, marked as discarded, so the history is kept.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../ports/identity';
import type { FailedJobRepository } from '../ports/jobs';
import type { Clock } from '../ports/platform';

/** Dependencies of DiscardFailedJob. */
export interface DiscardFailedJobDeps {
  failedJobs: FailedJobRepository;
  clock: Clock;
}

/** Marks a failed job as discarded. */
export class DiscardFailedJob {
  /** @param deps Failed-job storage and the clock. */
  constructor(private readonly deps: DiscardFailedJobDeps) {}

  /**
   * @param actor Signed-in admin. Only owners manage jobs.
   * @param jobId Failed job id.
   * @throws DomainError FORBIDDEN, NOT_FOUND, or INVALID_STATE when the job was already resolved.
   */
  async execute(actor: AdminUser, jobId: string): Promise<void> {
    if (!can(actor.role, 'jobs.manage')) throw new DomainError('FORBIDDEN', 'Only owners can discard jobs');
    const job = await this.deps.failedJobs.get(jobId);
    if (!job) throw new DomainError('NOT_FOUND', 'Job not found');
    // The repository's guard decides: a second admin may have resolved the job meanwhile.
    const applied = await this.deps.failedJobs.resolve(
      job.id,
      'discarded',
      this.deps.clock.now().toISOString(),
    );
    if (!applied) throw new DomainError('INVALID_STATE', 'This job was already resolved');
  }
}
