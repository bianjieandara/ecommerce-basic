// Wiring of the admin operations: order status changes, invoice resends and documents, failed jobs, notification retries, the
// contact inbox and the dashboard. Pages read through `reads` and change data only through the use cases. Kept apart from the
// container, like the inventory module, so the container stays a list of what exists.
import { GetDashboard } from '@/application/admin/get-dashboard';
import type { EvaluateStockChanges } from '@/application/inventory/evaluate-stock-changes';
import type { ConfirmPayment } from '@/application/ordering/confirm-payment';
import { ChangeOrderStatus } from '@/application/ordering/change-order-status';
import { OrderLinks } from '@/application/ordering/order-links';
import { MarkMessageRead } from '@/application/content/mark-message-read';
import { InvoiceDocumentForAdmin } from '@/application/invoicing/invoice-document-admin';
import { ResendInvoice } from '@/application/invoicing/resend-invoice';
import { DiscardFailedJob } from '@/application/jobs/discard-failed-job';
import { RetryFailedJob } from '@/application/jobs/retry-failed-job';
import { RetryNotification } from '@/application/notifications/retry-notification';
import type { NotificationService } from '@/application/notifications/notification-service';
import type { DashboardQueries } from '@/application/ports/dashboard';
import type { SettingsRepository, ContactMessageRepository } from '@/application/ports/content';
import type { AdminInvoiceQueries } from '@/application/ports/invoice-admin';
import type { InvoiceRepository } from '@/application/ports/invoicing';
import type { AdminOrderQueries } from '@/application/ports/order-admin';
import type { OrderRepository } from '@/application/ports/ordering';
import type { FailedJobRepository, JobQueue } from '@/application/ports/jobs';
import type { NotificationLogRepository } from '@/application/ports/notifications';
import type { Clock, Hasher } from '@/application/ports/platform';
import { D1DashboardQueries } from '@/infrastructure/d1/dashboard-queries';
import { D1InvoiceAdminQueries } from '@/infrastructure/d1/invoice-admin-queries';
import { D1OrderAdminQueries } from '@/infrastructure/d1/order-admin-queries';
import { logEvent } from '@/infrastructure/system/logger';

/** Read-only views of the stores, for the admin pages. Each one exposes reads only. */
export interface AdminReads {
  orders: AdminOrderQueries;
  invoices: AdminInvoiceQueries;
  orderRecords: Pick<OrderRepository, 'findByNumber' | 'listEvents'>;
  invoiceRecords: Pick<InvoiceRepository, 'findById' | 'findByOrderId'>;
  failedJobs: Pick<FailedJobRepository, 'list' | 'get'>;
  notificationLog: Pick<NotificationLogRepository, 'list' | 'get' | 'listForOrder'>;
  messages: Pick<ContactMessageRepository, 'list'>;
}

/** The admin operations the container exposes. */
export interface AdminOperations {
  reads: AdminReads;
  dashboard: GetDashboard;
  changeOrderStatus: ChangeOrderStatus;
  resendInvoice: ResendInvoice;
  invoiceDocument: InvoiceDocumentForAdmin;
  retryFailedJob: RetryFailedJob;
  discardFailedJob: DiscardFailedJob;
  retryNotification: RetryNotification;
  markMessageRead: MarkMessageRead;
}

/** Dependencies of the admin operations, all built by the container. */
export interface AdminOperationsDeps {
  clock: Clock;
  hasher: Hasher;
  settings: SettingsRepository;
  jobs: JobQueue;
  notifications: NotificationService;
  orders: OrderRepository;
  invoices: InvoiceRepository;
  failedJobs: FailedJobRepository;
  notificationLog: NotificationLogRepository;
  messages: ContactMessageRepository;
  confirmPayment: ConfirmPayment;
  evaluateStock: EvaluateStockChanges;
  siteUrl: string;
}

/**
 * Builds the admin operations from the Worker environment.
 * @param env Worker bindings (DB is used by the query modules).
 * @param deps Repositories and services built by the container.
 * @returns The wired operations.
 */
export function createAdminOperations(env: Env, deps: AdminOperationsDeps): AdminOperations {
  const links = new OrderLinks({ orders: deps.orders, hasher: deps.hasher });
  // A failed follow-up after a committed change is logged here; the change itself is never undone by it.
  const onError = (event: string, error: unknown) =>
    logEvent(event, { error: error instanceof Error ? error.message : 'unknown' });
  const dashboardQueries: DashboardQueries = new D1DashboardQueries(env.DB);
  return {
    reads: {
      orders: new D1OrderAdminQueries(env.DB),
      invoices: new D1InvoiceAdminQueries(env.DB),
      orderRecords: deps.orders,
      invoiceRecords: deps.invoices,
      failedJobs: deps.failedJobs,
      notificationLog: deps.notificationLog,
      messages: deps.messages,
    },
    dashboard: new GetDashboard({ settings: deps.settings, queries: dashboardQueries, clock: deps.clock }),
    changeOrderStatus: new ChangeOrderStatus({
      orders: deps.orders,
      confirmPayment: deps.confirmPayment,
      evaluateStock: deps.evaluateStock,
      notifications: deps.notifications,
      settings: deps.settings,
      links,
      clock: deps.clock,
      siteUrl: deps.siteUrl,
      onError,
    }),
    resendInvoice: new ResendInvoice({
      invoices: deps.invoices,
      orders: deps.orders,
      notifications: deps.notifications,
      settings: deps.settings,
      links,
      clock: deps.clock,
      siteUrl: deps.siteUrl,
    }),
    invoiceDocument: new InvoiceDocumentForAdmin({ invoices: deps.invoices, settings: deps.settings }),
    retryFailedJob: new RetryFailedJob({ failedJobs: deps.failedJobs, jobs: deps.jobs, clock: deps.clock }),
    discardFailedJob: new DiscardFailedJob({ failedJobs: deps.failedJobs, clock: deps.clock }),
    retryNotification: new RetryNotification({
      log: deps.notificationLog,
      failedJobs: deps.failedJobs,
      jobs: deps.jobs,
      clock: deps.clock,
    }),
    markMessageRead: new MarkMessageRead({ messages: deps.messages }),
  };
}
