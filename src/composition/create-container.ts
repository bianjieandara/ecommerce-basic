// Composition root: the only place where adapters are created and wired to the application layer.
// Called once per request (middleware) and once per queue batch or cron tick (worker entrypoint).
import { buildJobHandlers } from '@/application/jobs/handlers';
import { JobDispatcher } from '@/application/jobs/dispatcher';
import { JobScheduler } from '@/application/jobs/scheduler';
import type { BackgroundTasks, EmailSender } from '@/application/ports/platform';
import { ReviewsService } from '@/application/content/reviews-service';
import { EmailTemplateService } from '@/application/notifications/email-template-service';
import { NotificationService } from '@/application/notifications/notification-service';
import { SendNotificationEmail } from '@/application/notifications/send-notification-email';
import { D1CatalogQueryService } from '@/infrastructure/d1/catalog-query-service';
import { D1EmailTemplateRepository } from '@/infrastructure/d1/email-template-repository';
import { D1FailedJobRepository } from '@/infrastructure/d1/failed-job-repository';
import { D1InvoiceRepository } from '@/infrastructure/d1/invoice-repository';
import { D1NotificationLogRepository } from '@/infrastructure/d1/notification-log-repository';
import { D1OrderRepository } from '@/infrastructure/d1/order-repository';
import { D1PageRepository } from '@/infrastructure/d1/page-repository';
import { D1TestimonialRepository } from '@/infrastructure/d1/testimonial-repository';
import { TranslateText } from '@/application/ai/translate-text';
import { createWhatsApp } from './whatsapp';
import { BuildReport } from '@/application/reports/build-report';
import { DailyRollup } from '@/application/reports/jobs/daily-rollup';
import { PurgeOldRecords } from '@/application/reports/jobs/purge';
import { WeeklySummary } from '@/application/reports/jobs/weekly-summary';
import { PendingTrafficBreakdowns } from '@/application/reports/traffic-breakdowns';
import { D1ReportMaintenance } from '@/infrastructure/d1/reports-maintenance';
import { D1ReportsQueries } from '@/infrastructure/d1/reports-queries';
import { WorkersAiTranslator } from '@/infrastructure/ai/workers-ai-translator';
import { D1PaymentEventLog } from '@/infrastructure/d1/payment-event-log';
import { D1ShippingMethodRepository } from '@/infrastructure/d1/shipping-repository';
import { D1SettingsRepository } from '@/infrastructure/d1/settings-repository';
import { R2MediaStorage } from '@/infrastructure/r2/r2-media-storage';
import { readSecret } from '@/infrastructure/cloudflare/env';
import { GooglePlacesReviews } from '@/infrastructure/google/places-reviews-provider';
import { CloudflareJobQueue } from '@/infrastructure/queues/cloudflare-job-queue';
import { KvCacheStore, KvPageCacheVersion } from '@/infrastructure/kv/kv-adapters';
import {
  CloudflareEmailSender,
  ConsoleEmailSender,
  OutboxEmailSender,
} from '@/infrastructure/email/email-adapters';
import { InvoiceAttachments } from '@/infrastructure/invoicing/invoice-attachments';
import { CloudflareRateLimiter, TurnstileVerifier } from '@/infrastructure/security/security-adapters';
import { CryptoIdGenerator, SystemClock, WebCryptoHasher } from '@/infrastructure/system/system-adapters';
import { logEvent } from '@/infrastructure/system/logger';
import { AnalyticsEngineSink } from '@/infrastructure/analytics/analytics-engine-sink';
import { TrackEvent } from '@/application/marketing/track-event';
import { handleMetaCapi } from '@/application/marketing/handle-meta-capi';
import { MetaConversionsSink } from '@/infrastructure/meta/meta-conversions-sink';
import { MetaGraphClient } from '@/infrastructure/meta/graph-client';
import { readCapiSettings } from '@/infrastructure/meta/meta-config';
import { createCatalogAdmin, createMediaLibrary } from './admin-catalog';
import { createContentAdmin } from './admin-content';
import { createInventory } from './inventory';
import { createAdminOperations } from './admin-operations';
import { createGa4PurchaseHandler } from './ga4';
import { createIdentity } from './identity';
import { createOrdering } from './ordering';
import type { Container } from './container';

export type { Container } from './container';

/**
 * Builds the container from the Worker environment.
 * @param env Worker bindings and vars.
 * @param ctx Execution context (for waitUntil), or null outside a request.
 * @returns The wired container.
 */
export function createContainer(env: Env, ctx: ExecutionContext | null): Container {
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const hasher = new WebCryptoHasher();
  const cache = new KvCacheStore(env.CACHE);
  const media = new R2MediaStorage(env.MEDIA);
  // Settings are read once per request. In production requests also share the rows for 30 s, so a settings change reaches every
  // isolate within that time; in development every request reads them fresh, so edits to the local database show at once.
  const settings = new D1SettingsRepository(env.DB, { sharedTtlMs: import.meta.env.DEV ? 0 : 30_000 });
  const failedJobs = new D1FailedJobRepository(env.DB);
  const notificationLog = new D1NotificationLogRepository(env.DB);
  const emailTemplateRepository = new D1EmailTemplateRepository(env.DB);
  const orders = new D1OrderRepository(env.DB);
  const invoices = new D1InvoiceRepository(env.DB);
  const paymentEvents = new D1PaymentEventLog(env.DB);
  const jobQueue = new CloudflareJobQueue(
    env.JOBS,
    () => ids.newId(),
    () => clock.now().toISOString(),
  );
  const botVerifier = new TurnstileVerifier(readSecret('TURNSTILE_SECRET_KEY'));
  const siteUrl = env.PUBLIC_SITE_URL;

  // EMAIL_TRANSPORT=console (set in .dev.vars for local work) logs each email instead of sending it.
  // EMAIL_TRANSPORT=outbox (the public demo) keeps each message in storage instead of sending it; see OutboxEmailSender.
  const email: EmailSender =
    env.EMAIL_TRANSPORT === 'outbox'
      ? new OutboxEmailSender(media, () => ids.newId())
      : env.EMAIL && env.EMAIL_TRANSPORT !== 'console'
        ? new CloudflareEmailSender(env.EMAIL, env.EMAIL_FROM)
        : new ConsoleEmailSender();
  const notifications = new NotificationService({
    settings,
    logs: notificationLog,
    jobs: jobQueue,
    clock,
    ids,
    siteUrl,
  });
  const attachmentLoader = new InvoiceAttachments(invoices, media);
  const sendNotificationEmail = new SendNotificationEmail({
    templates: emailTemplateRepository,
    logs: notificationLog,
    sender: email,
    clock,
    attachments: attachmentLoader,
  });
  const whatsapp = createWhatsApp(env, {
    settings,
    logs: notificationLog,
    jobs: jobQueue,
    attachments: attachmentLoader,
    clock,
    ids,
    siteUrl,
  });

  const rateLimiter = new CloudflareRateLimiter({ auth: env.RL_AUTH, forms: env.RL_FORMS, api: env.RL_API });
  const { passwords, ...identity } = createIdentity(env, {
    hasher,
    ids,
    clock,
    notifications,
    botVerifier,
    rateLimiter,
    siteUrl,
    shipping: new D1ShippingMethodRepository(env.DB),
    settings,
  });

  const inventory = createInventory(env, {
    ids,
    clock,
    settings,
    cache,
    jobs: jobQueue,
    notifications,
    botVerifier,
    siteUrl,
  });
  const catalogAdmin = createCatalogAdmin(env, { ids, clock, evaluateStock: inventory.evaluateStock });
  const mediaLibrary = createMediaLibrary(env, { ids, clock, storage: media });

  const reviews = new ReviewsService({
    provider: new GooglePlacesReviews(readSecret('GOOGLE_PLACES_API_KEY')),
    cache,
    settings,
  });

  const { legal, pdf, dlocalgo, paypal, renderInvoicePdf, issueLegalInvoice, ...orderingServices } =
    createOrdering(env, {
      clock,
      ids,
      hasher,
      cache,
      settings,
      jobs: jobQueue,
      notifications,
      botVerifier,
      media,
      orders,
      invoices,
      paymentEvents,
      evaluateStock: inventory.evaluateStock,
      siteUrl,
    });
  const reportMaintenance = new D1ReportMaintenance(env.DB);
  const reportQueries = new D1ReportsQueries(env.DB);
  const reports = new BuildReport({
    settings,
    queries: reportQueries,
    traffic: new PendingTrafficBreakdowns(), // Stage 19 replaces this with the Analytics Engine reader
    clock,
  });
  const analytics = new AnalyticsEngineSink(env.EVENTS, env.CLIENT_SLUG);
  const trackEvent = new TrackEvent({ analytics, jobs: jobQueue, settings, clock, log: logEvent });
  const metaCapi = handleMetaCapi({
    sink: new MetaConversionsSink(new MetaGraphClient(readCapiSettings()), hasher, siteUrl),
    settings,
    log: logEvent,
  });
  const handlers = buildJobHandlers({
    failedJobs,
    clock,
    sendNotificationEmail,
    notifyWhatsapp: whatsapp.notifyWhatsapp,
    metaCapi,
    ga4Purchase: createGa4PurchaseHandler({ settings, log: logEvent }),
    expireStaleOrders: orderingServices.expireStaleOrders,
    issueInvoice: orderingServices.issueInvoice,
    renderInvoicePdf,
    issueLegalInvoice,
    reviews,
    inventoryAlerts: inventory.alerts,
    dailyRollup: new DailyRollup({ settings, maintenance: reportMaintenance, clock }),
    purgeOldRecords: new PurgeOldRecords({ maintenance: reportMaintenance, clock }),
    weeklySummary: new WeeklySummary({ settings, queries: reportQueries, notifications, clock, siteUrl }),
  });

  const background: BackgroundTasks = {
    run(task) {
      const guarded = task.catch((error: unknown) =>
        logEvent('background.failed', { reason: String(error) }),
      );
      if (ctx) ctx.waitUntil(guarded);
    },
  };

  const adminOps = createAdminOperations(env, {
    clock,
    hasher,
    settings,
    jobs: jobQueue,
    notifications,
    orders,
    invoices,
    issueInvoice: orderingServices.issueInvoice,
    failedJobs,
    notificationLog,
    confirmPayment: orderingServices.confirmPayment,
    evaluateStock: inventory.evaluateStock,
    siteUrl,
  });
  const emailTemplates = new EmailTemplateService({
    templates: emailTemplateRepository,
    settings,
    clock,
    siteUrl,
  });
  return {
    adminOps,
    config: { siteUrl, turnstileSiteKey: env.TURNSTILE_SITE_KEY },
    settings,
    pages: new D1PageRepository(env.DB),
    testimonials: new D1TestimonialRepository(env.DB),
    shipping: new D1ShippingMethodRepository(env.DB),
    media,
    catalog: ({ newDays, showOutOfStock }) =>
      new D1CatalogQueryService(env.DB, { newDays, showOutOfStock, now: () => clock.now() }),
    failedJobs,
    jobQueue,
    jobs: new JobDispatcher({ failedJobs, handlers, log: logEvent }),
    scheduler: new JobScheduler({ jobs: jobQueue, cache, clock, settings }),
    reports,
    notifications,
    emailTemplates,
    ...orderingServices,
    providers: { dlocalgo, paypal },
    reviews,
    ...identity,
    catalogAdmin,
    contentAdmin: createContentAdmin(env, { settings, clock, ids, notifications, emailTemplates }),
    translate: new TranslateText({ translator: new WorkersAiTranslator(env.AI) }),
    trackEvent,
    whatsapp: whatsapp.services,
    mediaLibrary,
    inventory,
    platform: {
      clock,
      ids,
      hasher,
      passwords,
      cache,
      pageCache: new KvPageCacheVersion(env.CACHE),
      analytics,
      botVerifier,
      rateLimiter,
      email,
      background,
      pdf,
      legalInvoices: legal,
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
