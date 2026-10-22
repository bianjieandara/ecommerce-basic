// RetryNotification: sends a failed message again. The failed job holds the whole message, so retrying re-queues those jobs; the
// message's own log row is updated when the send succeeds, because the log is keyed by the same idempotency key.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../ports/identity';
import type { FailedJobRepository, JobQueue } from '../ports/jobs';
import type { NotificationLogRepository } from '../ports/notifications';
import type { Clock } from '../ports/platform';

/** Dependencies of RetryNotification. */
export interface RetryNotificationDeps {
  log: NotificationLogRepository;
  failedJobs: FailedJobRepository;
  jobs: JobQueue;
  clock: Clock;
}

/** Sends a failed message again. */
export class RetryNotification {
  /** @param deps Log, failed-job storage, the queue and the clock. */
  constructor(private readonly deps: RetryNotificationDeps) {}

  /**
   * @param actor Signed-in admin. Only owners manage jobs, and so resend messages.
   * @param logId Notification log row id.
   * @returns How many failed jobs were queued again.
   * @throws DomainError FORBIDDEN, NOT_FOUND, or INVALID_STATE when the message is not failed, or still being retried.
   */
  async execute(actor: AdminUser, logId: string): Promise<{ retried: number }> {
    if (!can(actor.role, 'jobs.manage'))
      throw new DomainError('FORBIDDEN', 'Only owners can resend messages');
    const entry = await this.deps.log.get(logId);
    if (!entry) throw new DomainError('NOT_FOUND', 'Message not found');
    if (entry.status !== 'failed')
      throw new DomainError('INVALID_STATE', 'Only failed messages can be sent again');
    const jobs = await this.deps.failedJobs.findUnresolvedByNotificationKey(entry.idempotencyKey);
    if (jobs.length === 0) throw new DomainError('INVALID_STATE', 'This message is still being retried');
    await this.deps.jobs.enqueueMany(jobs.map((job) => ({ type: job.jobType, payload: job.payload })));
    await this.deps.failedJobs.resolveMany(
      jobs.map((job) => job.id),
      'retried',
      this.deps.clock.now().toISOString(),
    );
    return { retried: jobs.length };
  }
}
