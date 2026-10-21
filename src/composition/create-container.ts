// Composition root: the only place where adapters are created and wired to the application layer.
// Called once per request (middleware) and once per queue batch or cron tick (worker entrypoint).
import { buildJobHandlers } from '@/application/jobs/handlers';
import { JobDispatcher } from '@/application/jobs/dispatcher';
import { JobScheduler } from '@/application/jobs/scheduler';
import type { FailedJobRepository, JobQueue } from '@/application/ports/jobs';
import type {
  BotVerifier,
  BackgroundTasks,
  CacheStore,
  Clock,
  EmailSender,
  Hasher,
  IdGenerator,
  PageCacheVersion,
  RateLimiter,
} from '@/application/ports/platform';
import type { SettingsRepository } from '@/application/ports/content';
import { D1FailedJobRepository } from '@/infrastructure/d1/failed-job-repository';
import { D1SettingsRepository } from '@/infrastructure/d1/settings-repository';
import { readSecret } from '@/infrastructure/cloudflare/env';
import { CloudflareJobQueue } from '@/infrastructure/queues/cloudflare-job-queue';
import { KvCacheStore, KvPageCacheVersion } from '@/infrastructure/kv/kv-adapters';
import { CloudflareEmailSender, ConsoleEmailSender } from '@/infrastructure/email/email-adapters';
import {
  CloudflareRateLimiter,
  Pbkdf2PasswordHasher,
  TurnstileVerifier,
} from '@/infrastructure/security/security-adapters';
import { CryptoIdGenerator, SystemClock, WebCryptoHasher } from '@/infrastructure/system/system-adapters';
import { logEvent } from '@/infrastructure/system/logger';
import { NoopLegalInvoiceIssuer, NullPdfRenderer } from '@/infrastructure/invoicing/invoicing-adapters';
import type { LegalInvoiceIssuer, PdfRenderer } from '@/application/ports/invoicing';

/** Everything the application can use for one request or one job run. */
export interface Container {
  settings: SettingsRepository;
  failedJobs: FailedJobRepository;
  jobQueue: JobQueue;
  jobs: JobDispatcher;
  scheduler: JobScheduler;
  platform: {
    clock: Clock;
    ids: IdGenerator;
    hasher: Hasher;
    passwords: Pbkdf2PasswordHasher;
    cache: CacheStore;
    pageCache: PageCacheVersion;
    botVerifier: BotVerifier;
    rateLimiter: RateLimiter;
    email: EmailSender;
    background: BackgroundTasks;
    pdf: PdfRenderer;
    legalInvoices: LegalInvoiceIssuer;
  };
  health: {
    /** Runs a trivial query to confirm D1 answers. */
    checkDatabase(): Promise<boolean>;
  };
}

/**
 * Builds the container from the Worker environment.
 * @param env Worker bindings and vars.
 * @param ctx Execution context (for waitUntil), or null outside a request.
 * @returns The wired container.
 */
export function createContainer(env: Env, ctx: ExecutionContext | null): Container {
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const cache = new KvCacheStore(env.CACHE);
  const failedJobs = new D1FailedJobRepository(env.DB);
  const jobQueue = new CloudflareJobQueue(
    env.JOBS,
    () => ids.newId(),
    () => clock.now().toISOString(),
  );
  const handlers = buildJobHandlers({ failedJobs, clock });

  const email: EmailSender = env.EMAIL
    ? new CloudflareEmailSender(env.EMAIL, env.EMAIL_FROM)
    : new ConsoleEmailSender();

  const background: BackgroundTasks = {
    run(task) {
      const guarded = task.catch((error: unknown) =>
        logEvent('background.failed', { reason: String(error) }),
      );
      if (ctx) ctx.waitUntil(guarded);
    },
  };

  return {
    settings: new D1SettingsRepository(env.DB),
    failedJobs,
    jobQueue,
    jobs: new JobDispatcher({ failedJobs, handlers, log: logEvent }),
    scheduler: new JobScheduler({ jobs: jobQueue, cache, clock }),
    platform: {
      clock,
      ids,
      hasher: new WebCryptoHasher(),
      passwords: new Pbkdf2PasswordHasher(),
      cache,
      pageCache: new KvPageCacheVersion(env.CACHE),
      botVerifier: new TurnstileVerifier(readSecret('TURNSTILE_SECRET_KEY')),
      rateLimiter: new CloudflareRateLimiter({ auth: env.RL_AUTH, forms: env.RL_FORMS, api: env.RL_API }),
      email,
      background,
      pdf: new NullPdfRenderer(),
      legalInvoices: new NoopLegalInvoiceIssuer(),
    },
    health: {
      async checkDatabase() {
        try {
          await env.DB.prepare('SELECT 1').first();
          return true;
        } catch {
          return false;
        }
      },
    },
  };
}
