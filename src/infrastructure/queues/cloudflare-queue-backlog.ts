// Backlog of the job queue, read from the Queues binding. The local runtime does not report it, so a failed read gives null and
// the failed-jobs page still renders.
import type { QueueBacklog } from '@/application/ports/jobs';

/** The part of a Queues binding that reports its size. */
interface QueueMetricsSource {
  metrics(): Promise<{ backlogCount: number }>;
}

/** Reads the backlog from the platform's queue metrics. */
export class CloudflareQueueBacklog implements QueueBacklog {
  /** @param queue The job queue binding. */
  constructor(private readonly queue: QueueMetricsSource) {}

  /**
   * How many messages wait in the queue.
   * @returns The count, or null when the platform does not report it.
   */
  async count(): Promise<number | null> {
    try {
      return (await this.queue.metrics()).backlogCount;
    } catch {
      return null;
    }
  }
}
