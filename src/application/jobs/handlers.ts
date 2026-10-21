// Job handler registry for the handlers implemented so far. Each handler validates its payload with the schema
// from job-types.ts and calls application logic only; it never touches Cloudflare bindings directly.
import type { FailedJobRepository, JobType } from '../ports/jobs';
import type { Clock } from '../ports/platform';
import type { JobHandler } from './dispatcher';
import { maintenancePurgePayload } from './job-types';

/** Dependencies the implemented handlers need. */
export interface JobHandlerDeps {
  failedJobs: FailedJobRepository;
  clock: Clock;
}

/** Milliseconds in one day. */
const DAY_MS = 86_400_000;

/**
 * Builds the handlers implemented in this stage. Other job types are listed as pending in job-types.ts.
 * @param deps Repositories and clock used by the handlers.
 * @returns Handler per job type.
 */
export function buildJobHandlers(deps: JobHandlerDeps): Partial<Record<JobType, JobHandler>> {
  return {
    'maintenance.purge': async (payload) => {
      const input = maintenancePurgePayload.parse(payload);
      const cutoff = new Date(deps.clock.now().getTime() - input.resolvedFailedJobsOlderThanDays * DAY_MS);
      await deps.failedJobs.purgeResolvedBefore(cutoff.toISOString());
    },
  };
}
