// Job payload schemas. Each job type validates its payload with one zod schema; handlers re-use it.
// Types whose handlers arrive in a later stage use a permissive placeholder and are listed in PENDING_JOB_TYPES.
import { z } from 'zod';
import type { JobType } from '../ports/jobs';

/** Payload of the orders.expire_stale job (no input; the scheduler sends an empty object). */
export const expireStaleOrdersPayload = z.looseObject({});

/** Payload of maintenance.purge: how old resolved failed jobs must be before they are deleted. */
export const maintenancePurgePayload = z.object({
  resolvedFailedJobsOlderThanDays: z.number().int().min(1).max(3650).default(90),
});

/** Job types with a real schema in this stage. */
export const JOB_PAYLOAD_SCHEMAS: Partial<Record<JobType, z.ZodType>> = {
  'orders.expire_stale': expireStaleOrdersPayload,
  'maintenance.purge': maintenancePurgePayload,
};

/** Job types whose handlers are added in later stages. Dispatching one logs and acknowledges it. */
export const PENDING_JOB_TYPES: readonly JobType[] = [
  'orders.expire_stale',
  'notify.email',
  'notify.whatsapp',
  'invoice.render_pdf',
  'invoice.legal_issue',
  'marketing.meta_capi',
  'inventory.low_stock_alert',
  'inventory.back_in_stock',
  'reviews.refresh',
  'reports.weekly_summary',
  'analytics.daily_rollup',
];
