# Background jobs

Slow, external or retryable work never runs inside a customer request. It is enqueued and run by the queue consumer.

## Pieces

| Piece           | Where                                           | Role                                                                 |
| --------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Job envelope    | `application/ports/jobs.ts`                     | `{ id, type, payload, idempotencyKey, createdAt }`                   |
| Payload schemas | `application/jobs/job-types.ts`                 | One zod schema per job type                                          |
| Handlers        | `application/jobs/handlers.ts`                  | Implemented job types; each validates its payload                    |
| Dispatcher      | `application/jobs/dispatcher.ts`                | Runs a batch: ack, retry with backoff, or record a permanent failure |
| Backoff         | `application/jobs/backoff.ts`                   | 30 s, 2 min, 10 min, 30 min, 2 h (capped at 24 h)                    |
| Scheduler       | `application/jobs/scheduler.ts`                 | One cron tick per client: enqueues the periodic jobs                 |
| Queue adapter   | `infrastructure/queues/cloudflare-job-queue.ts` | Sends envelopes to the `JOBS` queue                                  |

## Rules

- **Retry:** a `RetryableError` (or any unknown error) calls `message.retry({ delaySeconds })`. The queue moves a message to
  the dead-letter queue after `max_retries` deliveries (5 for the main queue).
- **Permanent failure:** a `DomainError` or a zod error is recorded in `failed_jobs` and acknowledged. Retrying it would not help.
- **Dead-letter queue:** `<slug>-jobs-dlq` batches are recorded in `failed_jobs` and acknowledged. Admins retry or discard them
  from `/admin/jobs` (Stage 16).
- **Idempotency:** every envelope has an `idempotencyKey`. Handlers must be safe to run twice (notification log keys, invoice
  numbers, stock ledger, Meta event ids).
- **Pending types:** a job type listed in `PENDING_JOB_TYPES` is logged as `job.pending` and acknowledged until its handler exists.

## Cron

Cloudflare allows one cron expression per client (`client.jsonc` `cron`, default every 15 minutes). The scheduler runs on every tick:

- `orders.expire_stale` every tick (its handler arrives in Stage 10).
- `reviews.refresh` every 6 hours, `maintenance.purge` and `analytics.daily_rollup` once a day. A KV marker per period stops
  duplicates.

## Verifying locally

1. `npm run dev`, then send a job from a route with `context.locals.app.jobQueue.enqueue(...)`.
2. Trigger the cron tick: `curl "http://localhost:4321/cdn-cgi/local/scheduled?cron=*/15+*+*+*+*"`.
3. Check the logs for `job.done`, `job.pending`, `job.failed`. Check `failed_jobs` with
   `npx wrangler d1 execute DB --local --command "SELECT * FROM failed_jobs"`.
