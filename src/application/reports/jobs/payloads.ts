// Payload schemas of the report jobs. The purge job reuses the schema in application/jobs/job-types.ts.
import { z } from 'zod';

/** Payload of analytics.daily_rollup: the store-local day to roll up. Missing means yesterday (the scheduler sends none). */
export const dailyRollupPayload = z.object({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Parsed payload of analytics.daily_rollup. */
export type DailyRollupPayload = z.infer<typeof dailyRollupPayload>;

/** Payload of reports.weekly_summary: none. Extra fields are ignored. */
export const weeklySummaryPayload = z.looseObject({});
