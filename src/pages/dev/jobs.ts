// DEV ONLY: exercises the job pipeline without waiting for Cloudflare's retry schedule. "enqueue" puts a real job on the queue,
// so the consumer runs it. "dispatch-retry" and "dispatch-dlq" run a dispatcher over one fake message and report what it did
// with it: the retry delays it asked for, its acks, and the failed-job rows it wrote. Nothing here runs in production.
import type { APIRoute } from 'astro';
import { JobDispatcher, type QueueMessageLike } from '@/application/jobs/dispatcher';
import { JOB_PAYLOAD_SCHEMAS, PENDING_JOB_TYPES } from '@/application/jobs/job-types';
import type { JobHandler } from '@/application/jobs/dispatcher';
import type { JobType } from '@/application/ports/jobs';
import { RetryableError } from '@/domain/shared/errors';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!import.meta.env.DEV) return new Response('Not found', { status: 404 });
  const app = locals.app;
  const action = url.searchParams.get('action') ?? '';

  if (action === 'enqueue') {
    const type = url.searchParams.get('type') ?? '';
    const known = type in JOB_PAYLOAD_SCHEMAS || (PENDING_JOB_TYPES as readonly string[]).includes(type);
    if (!known) return Response.json({ ok: false, error: 'Unknown job type' }, { status: 400 });
    let payload: unknown;
    try {
      payload = JSON.parse(url.searchParams.get('payload') ?? '{}');
    } catch {
      return Response.json({ ok: false, error: 'Payload is not JSON' }, { status: 400 });
    }
    await app.jobQueue.enqueue(type as JobType, payload);
    return Response.json({ ok: true, data: { type, payload } });
  }

  if (action === 'dispatch-retry' || action === 'dispatch-dlq') {
    const attempts = Number(url.searchParams.get('attempts') ?? '1');
    // The handler always fails with a temporary error, which is what a provider outage looks like.
    const handlers: Partial<Record<JobType, JobHandler>> = {
      'notify.email': async () => {
        throw new RetryableError('dev: provider answered 503');
      },
    };
    const dispatcher = new JobDispatcher({
      failedJobs: app.failedJobs,
      handlers,
      log: (event, data) => console.log(JSON.stringify({ event, ...data })),
    });
    const outcome = { acks: 0, retries: [] as unknown[] };
    const message: QueueMessageLike = {
      id: `dev-${crypto.randomUUID()}`,
      body: {
        id: `dev-job-${crypto.randomUUID()}`,
        type: 'notify.email',
        payload: {},
        idempotencyKey: `dev:${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
      },
      attempts,
      ack: () => {
        outcome.acks += 1;
      },
      retry: (options) => {
        outcome.retries.push(options ?? {});
      },
    };
    const queue = action === 'dispatch-dlq' ? 'demo-jobs-dlq' : 'demo-jobs';
    await dispatcher.consumeBatch({ queue, messages: [message] });
    return Response.json({ ok: true, data: { queue, attempts, ...outcome } });
  }

  return Response.json({ ok: false, error: 'Unknown action' }, { status: 400 });
};
