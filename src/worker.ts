// Worker entrypoint. HTTP goes to the Astro handler from @astrojs/cloudflare. Queue batches and cron ticks
// build a container and hand the work to the application layer (see docs/JOBS.md).
import { handle } from '@astrojs/cloudflare/handler';
import { createContainer } from '@/composition/create-container';

export default {
  fetch: handle,

  /** Consumes job messages (main queue and dead-letter queue). */
  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void> {
    await createContainer(env, ctx).jobs.consumeBatch(batch);
  },

  /** Runs the single per-client cron tick: schedules periodic jobs. */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    await createContainer(env, ctx).scheduler.onTick();
  },
} satisfies ExportedHandler<Env>;
