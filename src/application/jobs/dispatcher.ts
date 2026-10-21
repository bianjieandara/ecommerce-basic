// Job dispatcher: runs queue batches. Temporary failures are retried with backoff; permanent failures are recorded
// in failed_jobs and acknowledged; messages that reached the dead-letter queue are recorded there.
import { z } from 'zod';
import { DomainError, RetryableError } from '@/domain/shared/errors';
import type { FailedJobRepository, JobEnvelope, JobType } from '../ports/jobs';
import { backoffSeconds } from './backoff';
import { PENDING_JOB_TYPES } from './job-types';

/** A job run function. The handler validates its own payload with the schema from job-types.ts. */
export type JobHandler = (payload: unknown) => Promise<void>;

/** Minimal view of a queue message, so the dispatcher stays free of Cloudflare types. */
export interface QueueMessageLike {
  id: string;
  body: unknown;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

/** Minimal view of a queue batch. */
export interface QueueBatchLike {
  queue: string;
  messages: readonly QueueMessageLike[];
}

/** Envelope validation: the shape every queued message must have. */
const envelopeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  payload: z.unknown(),
  idempotencyKey: z.string().min(1),
  createdAt: z.string().min(1),
});

/** Consumes queued jobs. */
export class JobDispatcher {
  /**
   * @param deps Failed-job storage, the handler registry and a logger hook.
   */
  constructor(
    private readonly deps: {
      failedJobs: FailedJobRepository;
      handlers: Partial<Record<JobType, JobHandler>>;
      log: (event: string, data: Record<string, unknown>) => void;
    },
  ) {}

  /**
   * Processes one queue batch. Dead-letter batches (queue name ends with "-dlq") are recorded and acknowledged.
   * @param batch Batch delivered by the queue consumer.
   */
  async consumeBatch(batch: QueueBatchLike): Promise<void> {
    const isDeadLetter = batch.queue.endsWith('-dlq');
    for (const message of batch.messages) {
      const parsed = envelopeSchema.safeParse(message.body);
      if (!parsed.success) {
        // A malformed envelope cannot be retried or typed, so it is logged and acknowledged.
        this.deps.log('job.invalid_envelope', { messageId: message.id, attempts: message.attempts });
        message.ack();
        continue;
      }
      const job: JobEnvelope = {
        ...parsed.data,
        type: parsed.data.type as JobType,
        attempts: message.attempts,
      };

      if (isDeadLetter) {
        await this.deps.failedJobs.record(job, 'Retries exhausted');
        message.ack();
        continue;
      }
      await this.runOne(job, message);
    }
  }

  /**
   * Runs one job and decides the message's fate.
   * @param job Validated envelope.
   * @param message Queue message to acknowledge or retry.
   */
  private async runOne(job: JobEnvelope, message: QueueMessageLike): Promise<void> {
    if ((PENDING_JOB_TYPES as readonly string[]).includes(job.type)) {
      this.deps.log('job.pending', { type: job.type, id: job.id });
      message.ack();
      return;
    }
    const handler = this.deps.handlers[job.type];
    if (!handler) {
      this.deps.log('job.unknown', { type: job.type, id: job.id });
      message.ack();
      return;
    }
    try {
      await handler(job.payload);
      this.deps.log('job.done', { type: job.type, id: job.id, attempts: job.attempts });
      message.ack();
    } catch (error) {
      if (error instanceof RetryableError) {
        this.deps.log('job.retry', {
          type: job.type,
          id: job.id,
          attempts: job.attempts,
          reason: error.message,
        });
        message.retry({ delaySeconds: backoffSeconds(job.attempts, error.retryAfterSeconds) });
        return;
      }
      if (error instanceof DomainError || error instanceof z.ZodError) {
        await this.deps.failedJobs.record(job, error.message);
        this.deps.log('job.failed', { type: job.type, id: job.id, reason: error.message });
        message.ack();
        return;
      }
      // Unknown errors are usually transient (network, provider outage): retry with backoff.
      this.deps.log('job.retry', {
        type: job.type,
        id: job.id,
        attempts: job.attempts,
        reason: String(error),
      });
      message.retry({ delaySeconds: backoffSeconds(job.attempts) });
    }
  }
}
