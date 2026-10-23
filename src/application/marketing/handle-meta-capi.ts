// Job handler of marketing.meta_capi: sends one event to the Conversions API. It re-reads the Meta settings when it runs, so
// switching the Conversions API off stops the queued events too. A store without a pixel or a token skips the job instead of
// failing it, because nothing is wrong with the event itself.
import { z } from 'zod';
import { TRACKED_EVENT_NAMES } from '@/domain/analytics/tracked-events';
import { isCurrencyCode, type CurrencyCode } from '@/domain/shared/currency';
import type { JobHandler } from '../jobs/dispatcher';
import type { ConversionEvent, ConversionsSink } from '../ports/analytics';
import type { SettingsRepository } from '../ports/content';
import type { LogEvent } from '../ports/platform';

/** One product line of a conversion. */
const conversionItem = z.object({
  productId: z.string().min(1).max(64),
  variantId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(999),
  priceMinor: z.number().int().min(0).max(1_000_000_000_000),
});

/**
 * Payload of marketing.meta_capi: a ConversionEvent as the queue carries it. Customer fields are null unless the visitor
 * granted marketing consent. The schema checks the shape again, because the payload was stored as JSON.
 */
export const metaCapiPayload = z.object({
  eventId: z.string().min(1).max(100),
  name: z.enum(TRACKED_EVENT_NAMES),
  occurredAt: z.iso.datetime(),
  path: z
    .string()
    .min(1)
    .max(500)
    .refine((path) => path.startsWith('/') && !path.startsWith('//'), 'Path must be relative to the site'),
  currency: z.custom<CurrencyCode>((value) => typeof value === 'string' && isCurrencyCode(value)),
  valueMinor: z.number().int().min(0).max(1_000_000_000_000).nullable(),
  items: z.array(conversionItem).max(500),
  orderId: z.string().min(1).max(64).nullable(),
  ip: z.string().max(64).nullable(),
  userAgent: z.string().max(500).nullable(),
  fbp: z.string().max(200).nullable(),
  fbc: z.string().max(200).nullable(),
  email: z.string().max(254).nullable(),
  phone: z.string().max(40).nullable(),
});

/** Dependencies of the handler. */
export interface MetaCapiDeps {
  sink: ConversionsSink;
  settings: SettingsRepository;
  log: LogEvent;
}

/**
 * Builds the handler of marketing.meta_capi.
 * @param deps Sink, settings and logger.
 * @returns The job handler: validates the payload, checks the settings, then sends the event.
 */
export function handleMetaCapi(deps: MetaCapiDeps): JobHandler {
  return async (payload) => {
    const event: ConversionEvent = metaCapiPayload.parse(payload);
    const marketing = await deps.settings.get('marketing');
    const pixelId = marketing.metaPixelId.trim();
    if (!marketing.metaCapiEnabled || pixelId === '') {
      deps.log('meta_capi.skipped', { reason: 'disabled', eventId: event.eventId });
      return;
    }
    if (!deps.sink.isConfigured()) {
      deps.log('meta_capi.skipped', { reason: 'not_configured', eventId: event.eventId });
      return;
    }
    const { defaultCountryCode } = await deps.settings.get('whatsapp');
    await deps.sink.send(event, {
      pixelId,
      testEventCode: marketing.metaTestEventCode.trim() || null,
      defaultCountryCode,
    });
  };
}
