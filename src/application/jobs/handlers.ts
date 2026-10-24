// Job handler registry for the handlers implemented so far. Each handler validates its payload with the schema from
// job-types.ts and calls application logic only; it never touches Cloudflare bindings directly.
import type { IssueInvoice } from '../invoicing/issue-invoice';
import type { IssueLegalInvoice } from '../invoicing/issue-legal-invoice';
import type { RenderInvoicePdf } from '../invoicing/render-invoice-pdf';
import type { ReviewsService } from '../content/reviews-service';
import type { InventoryAlerts } from '../inventory/inventory-alerts';
import type { ExpireStaleOrders } from '../ordering/expire-orders';
import type { SendNotificationEmail } from '../notifications/send-notification-email';
import type { DailyRollup } from '../reports/jobs/daily-rollup';
import type { PurgeOldRecords } from '../reports/jobs/purge';
import type { WeeklySummary } from '../reports/jobs/weekly-summary';
import type { FailedJobRepository, JobType } from '../ports/jobs';
import type { Clock } from '../ports/platform';
import type { JobHandler } from './dispatcher';
import {
  backInStockPayload,
  expireStaleOrdersPayload,
  invoiceIssuePayload,
  invoiceJobPayload,
  invoiceRenderPayload,
  lowStockAlertPayload,
  maintenancePurgePayload,
  notifyEmailPayload,
} from './job-types';
import { dailyRollupPayload, weeklySummaryPayload } from '../reports/jobs/payloads';

/** Dependencies the implemented handlers need. */
export interface JobHandlerDeps {
  failedJobs: FailedJobRepository;
  clock: Clock;
  sendNotificationEmail: SendNotificationEmail;
  notifyWhatsapp: JobHandler;
  metaCapi: JobHandler;
  ga4Purchase: JobHandler;
  expireStaleOrders: ExpireStaleOrders;
  issueInvoice: IssueInvoice;
  renderInvoicePdf: RenderInvoicePdf;
  issueLegalInvoice: IssueLegalInvoice;
  reviews: ReviewsService;
  inventoryAlerts: InventoryAlerts;
  dailyRollup: DailyRollup;
  purgeOldRecords: PurgeOldRecords;
  weeklySummary: WeeklySummary;
}

/**
 * Builds the handlers implemented so far. Other job types are listed as pending in job-types.ts.
 * @param deps Repositories, clock and use cases used by the handlers.
 * @returns Handler per job type.
 */
export function buildJobHandlers(deps: JobHandlerDeps): Partial<Record<JobType, JobHandler>> {
  return {
    'notify.whatsapp': deps.notifyWhatsapp,
    'marketing.meta_capi': deps.metaCapi,
    'marketing.ga4_purchase': deps.ga4Purchase,
    'maintenance.purge': async (payload) => {
      const input = maintenancePurgePayload.parse(payload);
      await deps.purgeOldRecords.execute(input.resolvedFailedJobsOlderThanDays);
    },
    'analytics.daily_rollup': async (payload) => {
      await deps.dailyRollup.execute(dailyRollupPayload.parse(payload).day ?? null);
    },
    'reports.weekly_summary': async (payload) => {
      weeklySummaryPayload.parse(payload);
      await deps.weeklySummary.execute();
    },
    'notify.email': async (payload) => {
      await deps.sendNotificationEmail.execute(notifyEmailPayload.parse(payload));
    },
    'orders.expire_stale': async (payload) => {
      expireStaleOrdersPayload.parse(payload);
      await deps.expireStaleOrders.execute();
    },
    'invoice.issue': async (payload) => {
      await deps.issueInvoice.executeIfAutomatic(invoiceIssuePayload.parse(payload).orderId);
    },
    'invoice.render_pdf': async (payload) => {
      const input = invoiceRenderPayload.parse(payload);
      await deps.renderInvoicePdf.execute(input.invoiceId, input.regenerate === true);
    },
    'reviews.refresh': async () => {
      await deps.reviews.refresh();
    },
    'invoice.legal_issue': async (payload) => {
      await deps.issueLegalInvoice.execute(invoiceJobPayload.parse(payload).invoiceId);
    },
    'inventory.low_stock_alert': async (payload) => {
      const input = lowStockAlertPayload.parse(payload);
      await deps.inventoryAlerts.lowStock(input.variantIds, input.alertId);
    },
    'inventory.back_in_stock': async (payload) => {
      const input = backInStockPayload.parse(payload);
      await deps.inventoryAlerts.backInStock(input.variantId, input.restockedAt);
    },
  };
}
