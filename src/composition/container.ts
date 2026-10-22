// The shape of the container: everything the application can use for one request or one job run. Kept apart from the wiring
// so the list of what exists can be read without the code that builds it.
import type { JobDispatcher } from '@/application/jobs/dispatcher';
import type { JobScheduler } from '@/application/jobs/scheduler';
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
import type { QuoteCart } from '@/application/cart/quote-cart';
import type { SubmitContactMessage } from '@/application/content/submit-contact-message';
import type { ReviewsService } from '@/application/content/reviews-service';
import type { InviteAdmin } from '@/application/identity/invite-admin';
import type { Login } from '@/application/identity/login';
import type { RequestPasswordReset, ResetPassword } from '@/application/identity/password-reset';
import type { SessionService } from '@/application/identity/sessions';
import type { SetupFirstOwner } from '@/application/identity/setup-first-owner';
import type { AdminUserRepository } from '@/application/ports/identity';
import type { CapturePayment } from '@/application/ordering/capture-payment';
import type { ConfirmPayment } from '@/application/ordering/confirm-payment';
import type { ExpireStaleOrders } from '@/application/ordering/expire-orders';
import type { GetOrderStatus } from '@/application/ordering/get-order-status';
import type { PlaceOrder } from '@/application/ordering/place-order';
import type { GetInvoiceHtml } from '@/application/invoicing/get-invoice-html';
import type { GetInvoicePdf } from '@/application/invoicing/get-invoice-pdf';
import type { IssueInvoice } from '@/application/invoicing/issue-invoice';
import type { VoidInvoice } from '@/application/invoicing/void-invoice';
import type { MediaStorage } from '@/application/ports/media';
import type { PageRepository, SettingsRepository } from '@/application/ports/content';
import type { LegalInvoiceIssuer, PdfRenderer } from '@/application/ports/invoicing';
import type { EmailTemplateService } from '@/application/notifications/email-template-service';
import type { NotificationService } from '@/application/notifications/notification-service';
import type { PayPalGateway } from '@/infrastructure/payments/paypal-gateway';
import type { DLocalGoGateway } from '@/infrastructure/payments/dlocalgo-gateway';
import type { Pbkdf2PasswordHasher } from '@/infrastructure/security/security-adapters';
import type { CatalogAdmin } from './admin-catalog';
import type { InventoryServices } from './inventory';
import type { AdminOperations } from './admin-operations';
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
  providers: { dlocalgo: DLocalGoGateway; paypal: PayPalGateway };
  placeOrder: PlaceOrder;
  confirmPayment: ConfirmPayment;
  capturePayment: CapturePayment;
  orderStatus: GetOrderStatus;
  expireStaleOrders: ExpireStaleOrders;
  /** Issues the invoice of a paid order (automatically or by the admin). */
  issueInvoice: IssueInvoice;
  /** Customer PDF download. */
  invoicePdf: GetInvoicePdf;
  /** Customer invoice page: the same document as the PDF, as HTML. */
  invoiceHtml: GetInvoiceHtml;
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
  /** Admin operations: order status changes, invoice resends, failed jobs, notification retries, the inbox and the dashboard. */
  adminOps: AdminOperations;
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
