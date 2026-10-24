// Job handler of marketing.ga4_purchase: sends one purchase to GA4. It re-reads the marketing settings when it runs, so clearing the
// measurement ID stops the queued purchases too. A store without an API secret skips the job instead of failing it, because nothing
// is wrong with the purchase itself.
import { z } from 'zod';
import { isCurrencyCode, type CurrencyCode } from '@/domain/shared/currency';
import type { JobHandler } from '../jobs/dispatcher';
import type { Ga4Purchase, Ga4Sink } from '../ports/analytics';
import type { SettingsRepository } from '../ports/content';
import type { LogEvent } from '../ports/platform';

/** One product line of the purchase. */
const purchaseItem = z.object({
  productId: z.string().min(1).max(64),
  variantId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(999),
  priceMinor: z.number().int().min(0).max(1_000_000_000_000),
});

/** Money amount in minor units, as the queue carries it. */
const minor = z.number().int().min(0).max(1_000_000_000_000);

/** Payload of marketing.ga4_purchase: a Ga4Purchase as stored in the queue, checked again because it was stored as JSON. */
export const ga4PurchasePayload = z.object({
  transactionId: z.string().min(1).max(64),
  clientId: z.string().min(1).max(40),
  sessionId: z.string().min(1).max(20).nullable(),
  currency: z.custom<CurrencyCode>((value) => typeof value === 'string' && isCurrencyCode(value)),
  valueMinor: minor,
  taxMinor: minor,
  shippingMinor: minor,
  items: z.array(purchaseItem).max(500),
});

/** Dependencies of the handler. */
export interface Ga4PurchaseDeps {
  sink: Ga4Sink;
  settings: SettingsRepository;
  log: LogEvent;
}

/**
 * Builds the handler of marketing.ga4_purchase.
 * @param deps Sink, settings and logger.
 * @returns The job handler: validates the payload, checks the settings, then sends the purchase.
 */
export function handleGa4Purchase(deps: Ga4PurchaseDeps): JobHandler {
  return async (payload) => {
    const purchase: Ga4Purchase = ga4PurchasePayload.parse(payload);
    const measurementId = (await deps.settings.get('marketing')).ga4MeasurementId.trim();
    if (measurementId === '') {
      deps.log('ga4_purchase.skipped', { reason: 'disabled', transactionId: purchase.transactionId });
      return;
    }
    if (!deps.sink.isConfigured()) {
      deps.log('ga4_purchase.skipped', { reason: 'not_configured', transactionId: purchase.transactionId });
      return;
    }
    await deps.sink.send(purchase, measurementId);
  };
}
