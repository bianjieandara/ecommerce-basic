// Job queue adapter: puts job envelopes on the JOBS queue. Envelopes are plain JSON; attempts come from the queue.
import type { EnqueueOptions, JobQueue, JobType } from '@/application/ports/jobs';

/** Body stored on the queue. `attempts` is not stored: the queue counts deliveries itself. */
export interface QueuedJob {
  id: string;
  type: JobType;
  payload: unknown;
  idempotencyKey: string;
  createdAt: string;
}

/** Largest delay a queued message can have (24 hours). */
const MAX_DELAY_SECONDS = 86_400;

/** Queues accept at most 100 messages and 256 KB per sendBatch call; the byte budget leaves room for the envelope. */
const MAX_BATCH_MESSAGES = 100;
const MAX_BATCH_BYTES = 250_000;

/** Cloudflare Queues implementation of JobQueue. */
export class CloudflareJobQueue implements JobQueue {
  /**
   * @param queue The JOBS producer binding.
   * @param newId Identifier generator.
   * @param nowIso Clock in ISO format.
   */
  constructor(
    private readonly queue: Queue<QueuedJob>,
    private readonly newId: () => string,
    private readonly nowIso: () => string,
  ) {}

  async enqueue(type: JobType, payload: unknown, options: EnqueueOptions = {}): Promise<void> {
    await this.queue.send(this.envelope(type, payload, options), delayOption(options));
  }

  async enqueueMany(jobs: { type: JobType; payload: unknown; options?: EnqueueOptions }[]): Promise<void> {
    // The platform's limits are this adapter's business: callers may pass any number of jobs.
    for (const batch of splitForSendBatch(
      jobs.map((job) => ({
        body: this.envelope(job.type, job.payload, job.options ?? {}),
        ...delayOption(job.options ?? {}),
      })),
    )) {
      await this.queue.sendBatch(batch);
    }
  }

  /**
   * Builds the body of one message.
   * @param type Job type.
   * @param payload Job payload (JSON-serializable).
   * @param options Enqueue options.
   * @returns The envelope body.
   */
  private envelope(type: JobType, payload: unknown, options: EnqueueOptions): QueuedJob {
    const id = this.newId();
    return {
      id,
      type,
      payload,
      idempotencyKey: options.idempotencyKey ?? id,
      createdAt: this.nowIso(),
    };
  }
}

/**
 * Converts the optional delay into the queue's option shape, clamped to the allowed range.
 * @param options Enqueue options.
 * @returns An object with delaySeconds, or an empty object when there is no delay.
 */
function delayOption(options: EnqueueOptions): { delaySeconds?: number } {
  if (options.delaySeconds === undefined) return {};
  return { delaySeconds: Math.min(MAX_DELAY_SECONDS, Math.max(0, Math.floor(options.delaySeconds))) };
}

/**
 * Splits messages into groups that fit one sendBatch call: at most 100 messages and about 250 KB.
 * @param messages Messages in order.
 * @returns The groups, in order. An empty list gives no groups.
 */
function splitForSendBatch<T extends { body: unknown }>(messages: T[]): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const message of messages) {
    const size = new TextEncoder().encode(JSON.stringify(message.body)).length;
    if (current.length > 0 && (current.length >= MAX_BATCH_MESSAGES || bytes + size > MAX_BATCH_BYTES)) {
      groups.push(current);
      current = [];
      bytes = 0;
    }
    current.push(message);
    bytes += size;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}
