// Worker entrypoint. HTTP goes to the Astro handler from @astrojs/cloudflare; queue batches and cron ticks
// arrive here too. Stage 1 only logs them; Stage 5 routes them to the application layer (see docs/JOBS.md).
import { handle } from '@astrojs/cloudflare/handler';

export default {
  fetch: handle,

  /** Receives job messages. Stage 1 acknowledges them without work; Stage 5 dispatches them. */
  async queue(batch: MessageBatch<unknown>): Promise<void> {
    console.log(`[queue] ${batch.queue}: ${batch.messages.length} message(s)`);
    batch.ackAll();
  },

  /** Receives the single per-client cron tick. Stage 5 runs the scheduler here. */
  async scheduled(controller: ScheduledController): Promise<void> {
    console.log(`[cron] ${controller.cron} at ${new Date(controller.scheduledTime).toISOString()}`);
  },
} satisfies ExportedHandler<Env>;
