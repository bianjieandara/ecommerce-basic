// Job payload schemas. Each job type validates its payload with one zod schema; handlers re-use it.
// Types whose handlers arrive in a later stage use no schema and are listed in PENDING_JOB_TYPES.
import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@/domain/shared/locale';
import type { NotificationContext } from '../notifications/context';
import type { JobType } from '../ports/jobs';
import { NOTIFICATION_KEYS, type EmailAttachmentRef } from '../ports/notifications';
import { dailyRollupPayload, weeklySummaryPayload } from '../reports/jobs/payloads';

/** Payload of the orders.expire_stale job (no input; the scheduler sends an empty object). */
export const expireStaleOrdersPayload = z.looseObject({});

/** Payload of maintenance.purge: how old resolved failed jobs must be before they are deleted. */
export const maintenancePurgePayload = z.object({
  resolvedFailedJobsOlderThanDays: z.number().int().min(1).max(3650).default(90),
});

/** A deliverable email address. NotificationService checks it too, so bad addresses are logged as skipped. */
export const emailAddress = z.email().max(254);

/**
 * Payload of notify.email: one queued email. NotificationService builds the context with every section filled in, so
 * only its shape is checked here. Attachments are references; the bytes are read when the email is sent.
 */
export const notifyEmailPayload = z.object({
  idempotencyKey: z.string().min(1).max(300),
  key: z.enum(NOTIFICATION_KEYS),
  locale: z.enum(SUPPORTED_LOCALES),
  to: emailAddress,
  context: z.custom<NotificationContext>((value) => typeof value === 'object' && value !== null),
  attachments: z
    .array(z.custom<EmailAttachmentRef>((value) => typeof value === 'object' && value !== null))
    .default([]),
});

/** Parsed payload of notify.email. */
export type NotifyEmailPayload = z.infer<typeof notifyEmailPayload>;

/** Payload of the invoice jobs that work on an existing invoice. */
export const invoiceJobPayload = z.object({ invoiceId: z.string().min(1).max(64) });

/**
 * Payload of invoice.render_pdf: the invoice, and whether a stored PDF is replaced. The job queued after issuing leaves
 * `regenerate` out; an admin's request for a fresh copy sets it.
 */
export const invoiceRenderPayload = z.object({
  invoiceId: z.string().min(1).max(64),
  regenerate: z.boolean().optional(),
});

/** Payload of invoice.issue: the paid order to issue an invoice for. */
export const invoiceIssuePayload = z.object({ orderId: z.string().min(1).max(64) });

/**
 * Payload of inventory.low_stock_alert: every variant one operation pushed to its line, so an import that crosses a hundred
 * lines sends one table, not a hundred emails. `alertId` names the alert; the notification key is built on it, so a retry of
 * the job sends nothing twice.
 */
export const lowStockAlertPayload = z.object({
  alertId: z.string().min(1).max(64),
  variantIds: z.array(z.string().min(1).max(64)).min(1).max(500),
});

/**
 * Payload of inventory.back_in_stock: the variant that has stock again, and when it did. Each restock is a separate event,
 * so a subscriber is told once per restock even when the same variant sells out and comes back.
 */
export const backInStockPayload = z.object({
  variantId: z.string().min(1).max(64),
  restockedAt: z.iso.datetime(),
});

/** Job types with a real schema in this stage. */
export const JOB_PAYLOAD_SCHEMAS: Partial<Record<JobType, z.ZodType>> = {
  'orders.expire_stale': expireStaleOrdersPayload,
  'maintenance.purge': maintenancePurgePayload,
  'analytics.daily_rollup': dailyRollupPayload,
  'reports.weekly_summary': weeklySummaryPayload,
  'notify.email': notifyEmailPayload,
  'invoice.issue': invoiceIssuePayload,
  'invoice.render_pdf': invoiceRenderPayload,
  'invoice.legal_issue': invoiceJobPayload,
  'inventory.low_stock_alert': lowStockAlertPayload,
  'inventory.back_in_stock': backInStockPayload,
};

/** Job types whose handlers are added in later stages. Dispatching one logs and acknowledges it. */
export const PENDING_JOB_TYPES: readonly JobType[] = ['marketing.meta_capi'];
