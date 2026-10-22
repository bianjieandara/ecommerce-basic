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
import type { CatalogQueryService } from '@/application/ports/catalog';
import type { ShippingMethodRepository } from '@/application/ports/ordering';
import type { PaymentGateway, PaymentMethod } from '@/application/ports/payments';
import { QuoteCart } from '@/application/cart/quote-cart';
import { SubmitContactMessage } from '@/application/content/submit-contact-message';
import { ReviewsService } from '@/application/content/reviews-service';
import { InviteAdmin } from '@/application/identity/invite-admin';
import { Login } from '@/application/identity/login';
import { RequestPasswordReset, ResetPassword } from '@/application/identity/password-reset';
import { SessionService } from '@/application/identity/sessions';
import { SetupFirstOwner } from '@/application/identity/setup-first-owner';
import type { AdminUserRepository } from '@/application/ports/identity';
import {
  D1AdminUserRepository,
  D1PasswordResetRepository,
  D1SessionRepository,
} from '@/infrastructure/d1/identity-repositories';
import { CapturePayment } from '@/application/ordering/capture-payment';
import { ConfirmPayment } from '@/application/ordering/confirm-payment';
import { ExpireStaleOrders } from '@/application/ordering/expire-orders';
import { GetOrderStatus } from '@/application/ordering/get-order-status';
import { PlaceOrder } from '@/application/ordering/place-order';
import { GetInvoicePdf } from '@/application/invoicing/get-invoice-pdf';
import { IssueInvoice } from '@/application/invoicing/issue-invoice';
import { IssueLegalInvoice } from '@/application/invoicing/issue-legal-invoice';
import { RenderInvoicePdf } from '@/application/invoicing/render-invoice-pdf';
import { VoidInvoice } from '@/application/invoicing/void-invoice';
import type { MediaStorage } from '@/application/ports/media';
import type { PageRepository, SettingsRepository } from '@/application/ports/content';
import type { LegalInvoiceIssuer, PdfRenderer } from '@/application/ports/invoicing';
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
import { D1PaymentEventLog } from '@/infrastructure/d1/payment-event-log';
import { D1ShippingMethodRepository } from '@/infrastructure/d1/shipping-repository';
import { D1SettingsRepository } from '@/infrastructure/d1/settings-repository';
import { R2MediaStorage } from '@/infrastructure/r2/r2-media-storage';
import { readSecret } from '@/infrastructure/cloudflare/env';
import { D1ContactMessageRepository } from '@/infrastructure/d1/contact-message-repository';
import { GooglePlacesReviews } from '@/infrastructure/google/places-reviews-provider';
import { CloudflareJobQueue } from '@/infrastructure/queues/cloudflare-job-queue';
import { KvCacheStore, KvPageCacheVersion } from '@/infrastructure/kv/kv-adapters';
import { CloudflareEmailSender, ConsoleEmailSender } from '@/infrastructure/email/email-adapters';
import { InvoiceAttachments } from '@/infrastructure/invoicing/invoice-attachments';
import { BrowserRunPdfRenderer, NoopLegalInvoiceIssuer } from '@/infrastructure/invoicing/invoicing-adapters';
import {
  BankTransferGateway,
  CashOnDeliveryGateway,
  WhatsAppGateway,
} from '@/infrastructure/payments/manual-gateways';
import { PayPalGateway } from '@/infrastructure/payments/paypal-gateway';
import { StripeGateway } from '@/infrastructure/payments/stripe-gateway';
import {
  CloudflareRateLimiter,
  Pbkdf2PasswordHasher,
  TurnstileVerifier,
} from '@/infrastructure/security/security-adapters';
import { CryptoIdGenerator, SystemClock, WebCryptoHasher } from '@/infrastructure/system/system-adapters';
import { logEvent } from '@/infrastructure/system/logger';
import { createCatalogAdmin, createMediaLibrary, type CatalogAdmin } from './admin-catalog';
import { createInventory, type InventoryServices } from './inventory';
import type { MediaLibrary } from '@/application/media/media-library';

/** Everything the application can use for one request or one job run. */
export interface Container {
  /** Public configuration that pages read. */
  config: { siteUrl: string; turnstileSiteKey: string };
  settings: SettingsRepository;
  pages: PageRepository;
  shipping: ShippingMethodRepository;
  /** Cart quoting (server-side prices). newDays comes from the catalog settings. */
  quoteCart: (options: { newDays: number }) => QuoteCart;
  media: MediaStorage;
  /** Storefront read model. `newDays` comes from the catalog settings ("new" badge window). */
  catalog: (options: { newDays: number }) => CatalogQueryService;
  failedJobs: FailedJobRepository;
  jobQueue: JobQueue;
  jobs: JobDispatcher;
  scheduler: JobScheduler;
  /** Queues notifications. Nothing is sent inline; the notify.* jobs deliver them. */
  notifications: NotificationService;
  /** Email template editing and previews. */
  emailTemplates: EmailTemplateService;
  /** One payment gateway per method. */
  gateways: Record<PaymentMethod, PaymentGateway>;
  /** Provider adapters that also verify webhooks. */
  providers: { stripe: StripeGateway; paypal: PayPalGateway };
  placeOrder: PlaceOrder;
  confirmPayment: ConfirmPayment;
  capturePayment: CapturePayment;
  orderStatus: GetOrderStatus;
  expireStaleOrders: ExpireStaleOrders;
  /** Issues the invoice of a paid order (automatically or by the admin). */
  issueInvoice: IssueInvoice;
  /** Customer PDF download. */
  invoicePdf: GetInvoicePdf;
  voidInvoice: VoidInvoice;
  /** Contact form: stores the message and queues the store alert and the auto-reply. */
  submitContact: SubmitContactMessage;
  /** Google reviews: the job refreshes them, pages read them from KV. */
  reviews: ReviewsService;
  /** Admin accounts and sessions. */
  adminUsers: AdminUserRepository;
  sessions: SessionService;
  setupOwner: SetupFirstOwner;
  login: Login;
  requestPasswordReset: RequestPasswordReset;
  resetPassword: ResetPassword;
  inviteAdmin: InviteAdmin;
  /** Admin catalog: products, categories, attributes and the product list. */
  catalogAdmin: CatalogAdmin;
  /** Image library: uploads of resized variants, listing and removal. */
  mediaLibrary: MediaLibrary;
  /** Inventory: manual adjustments, CSV import, the ledger, alerts and back-in-stock subscriptions. */
  inventory: InventoryServices;
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
  const hasher = new WebCryptoHasher();
  const cache = new KvCacheStore(env.CACHE);
  const media = new R2MediaStorage(env.MEDIA);
  const settings = new D1SettingsRepository(env.DB);
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
  const email: EmailSender =
    env.EMAIL && env.EMAIL_TRANSPORT !== 'console'
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
  const sendNotificationEmail = new SendNotificationEmail({
    templates: emailTemplateRepository,
    logs: notificationLog,
    sender: email,
    clock,
    attachments: new InvoiceAttachments(invoices, media),
  });

  const adminUsers = new D1AdminUserRepository(env.DB);
  const sessions = new SessionService({ sessions: new D1SessionRepository(env.DB), hasher, ids, clock });
  const passwordResets = new D1PasswordResetRepository(env.DB);
  const passwords = new Pbkdf2PasswordHasher();
  const rateLimiter = new CloudflareRateLimiter({ auth: env.RL_AUTH, forms: env.RL_FORMS, api: env.RL_API });
  const setupOwner = new SetupFirstOwner({
    users: adminUsers,
    passwords,
    sessions,
    ids,
    clock,
    setupToken: readSecret('SETUP_TOKEN'),
  });
  const login = new Login({ users: adminUsers, passwords, sessions, botVerifier, rateLimiter, clock });
  const requestPasswordReset = new RequestPasswordReset({
    users: adminUsers,
    resets: passwordResets,
    hasher,
    ids,
    clock,
    notifications,
    botVerifier,
    rateLimiter,
    siteUrl,
  });
  const resetPassword = new ResetPassword({
    users: adminUsers,
    resets: passwordResets,
    passwords,
    hasher,
    sessions,
    clock,
  });
  const inviteAdmin = new InviteAdmin({
    users: adminUsers,
    resets: passwordResets,
    passwords,
    hasher,
    ids,
    clock,
    notifications,
    siteUrl,
  });

  const inventory = createInventory(env, {
    ids,
    clock,
    settings,
    jobs: jobQueue,
    notifications,
    botVerifier,
    siteUrl,
  });
  const catalogAdmin = createCatalogAdmin(env, {
    ids,
    clock,
    settings,
    evaluateStock: inventory.evaluateStock,
  });
  const mediaLibrary = createMediaLibrary(env, { ids, clock, storage: media });

  const contactMessages = new D1ContactMessageRepository(env.DB);
  const submitContact = new SubmitContactMessage({
    messages: contactMessages,
    settings,
    notifications,
    botVerifier,
    clock,
    ids,
  });
  const reviews = new ReviewsService({
    provider: new GooglePlacesReviews(readSecret('GOOGLE_PLACES_API_KEY')),
    cache,
    settings,
  });

  const legal = new NoopLegalInvoiceIssuer();
  const pdf = new BrowserRunPdfRenderer(env.BROWSER);
  const pdfDeps = { invoices, settings, pdf, media, clock };
  const issueInvoice = new IssueInvoice({ orders, invoices, settings, jobs: jobQueue, legal, clock, ids });
  const renderInvoicePdf = new RenderInvoicePdf({ ...pdfDeps, orders, notifications, siteUrl });
  const issueLegalInvoice = new IssueLegalInvoice({ invoices, legal, clock });
  const expireStaleOrders = new ExpireStaleOrders({
    orders,
    notifications,
    settings,
    evaluateStock: inventory.evaluateStock,
    clock,
    siteUrl,
  });
  const handlers = buildJobHandlers({
    failedJobs,
    clock,
    sendNotificationEmail,
    expireStaleOrders,
    renderInvoicePdf,
    issueLegalInvoice,
    reviews,
    inventoryAlerts: inventory.alerts,
  });

  const stripe = new StripeGateway(readSecret('STRIPE_SECRET_KEY'), readSecret('STRIPE_WEBHOOK_SECRET'));
  const paypal = new PayPalGateway(
    {
      clientId: readSecret('PAYPAL_CLIENT_ID'),
      clientSecret: readSecret('PAYPAL_CLIENT_SECRET'),
      webhookId: readSecret('PAYPAL_WEBHOOK_ID'),
      environment: String(env.PAYPAL_ENV) === 'live' ? 'live' : 'sandbox',
    },
    cache,
  );
  const gateways: Record<PaymentMethod, PaymentGateway> = {
    stripe,
    paypal,
    whatsapp: new WhatsAppGateway(),
    bank_transfer: new BankTransferGateway(),
    cash_on_delivery: new CashOnDeliveryGateway(),
  };
  const confirmPayment = new ConfirmPayment({
    orders,
    events: paymentEvents,
    notifications,
    settings,
    issueInvoice,
    evaluateStock: inventory.evaluateStock,
    clock,
    siteUrl,
  });
  const quoteCart = ({ newDays }: { newDays: number }) =>
    new QuoteCart({
      catalog: new D1CatalogQueryService(env.DB, { newDays, now: () => clock.now() }),
      shipping: new D1ShippingMethodRepository(env.DB),
    });
  const placeOrder = new PlaceOrder({
    settings,
    quoteCart,
    orders,
    gateways,
    botVerifier,
    hasher,
    ids,
    clock,
    notifications,
    evaluateStock: inventory.evaluateStock,
    siteUrl,
  });
  const orderStatus = new GetOrderStatus({ orders, invoices, hasher });

  const background: BackgroundTasks = {
    run(task) {
      const guarded = task.catch((error: unknown) =>
        logEvent('background.failed', { reason: String(error) }),
      );
      if (ctx) ctx.waitUntil(guarded);
    },
  };

  return {
    config: { siteUrl, turnstileSiteKey: env.TURNSTILE_SITE_KEY },
    settings,
    pages: new D1PageRepository(env.DB),
    shipping: new D1ShippingMethodRepository(env.DB),
    quoteCart,
    media,
    catalog: ({ newDays }) => new D1CatalogQueryService(env.DB, { newDays, now: () => clock.now() }),
    failedJobs,
    jobQueue,
    jobs: new JobDispatcher({ failedJobs, handlers, log: logEvent }),
    scheduler: new JobScheduler({ jobs: jobQueue, cache, clock }),
    notifications,
    emailTemplates: new EmailTemplateService({
      templates: emailTemplateRepository,
      settings,
      clock,
      siteUrl,
    }),
    gateways,
    providers: { stripe, paypal },
    placeOrder,
    confirmPayment,
    capturePayment: new CapturePayment({ orders, gateways, confirmPayment }),
    orderStatus,
    expireStaleOrders,
    issueInvoice,
    invoicePdf: new GetInvoicePdf({ ...pdfDeps, orderStatus, invoices, media }),
    voidInvoice: new VoidInvoice({ invoices, orders, clock }),
    submitContact,
    reviews,
    adminUsers,
    sessions,
    setupOwner,
    login,
    requestPasswordReset,
    resetPassword,
    inviteAdmin,
    catalogAdmin,
    mediaLibrary,
    inventory,
    platform: {
      clock,
      ids,
      hasher,
      passwords,
      cache,
      pageCache: new KvPageCacheVersion(env.CACHE),
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
