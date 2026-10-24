// Composition of the GA4 purchase job: the Measurement Protocol sink with its secret from the Worker environment, and the handler.
import { handleGa4Purchase } from '@/application/marketing/handle-ga4-purchase';
import type { JobHandler } from '@/application/jobs/dispatcher';
import type { SettingsRepository } from '@/application/ports/content';
import type { LogEvent } from '@/application/ports/platform';
import { readSecret } from '@/infrastructure/cloudflare/env';
import { Ga4MeasurementProtocolSink } from '@/infrastructure/google/ga4-measurement-protocol';

/**
 * Builds the handler of marketing.ga4_purchase.
 * @param deps Settings and logger.
 * @returns The job handler. Without GA4_API_SECRET it skips every job.
 */
export function createGa4PurchaseHandler(deps: { settings: SettingsRepository; log: LogEvent }): JobHandler {
  const sink = new Ga4MeasurementProtocolSink({
    apiSecret: readSecret('GA4_API_SECRET'),
    baseUrl: readSecret('GA4_MP_BASE_URL'),
  });
  return handleGa4Purchase({ sink, settings: deps.settings, log: deps.log });
}
