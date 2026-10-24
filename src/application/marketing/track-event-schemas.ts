// Input of POST /api/events. A batch holds at most ten browser events; each one is checked before anything is recorded,
// so a refused batch changes nothing.
import '@/application/zod-config';
import { z } from 'zod';
import { BROWSER_EVENT_NAMES, localeOfPath } from '@/domain/analytics/tracked-events';

/** Most events one request may carry. A browser sends one or two per action, so more is misuse. */
export const MAX_EVENTS_PER_REQUEST = 10;

/** Most product lines one event may carry (a large cart). */
const MAX_ITEMS = 100;

/** One product line of a browser event. Prices are minor units, like everywhere else. */
const browserItemInput = z.object({
  productId: z.string().min(1).max(64),
  variantId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(999),
  priceMinor: z.number().int().min(0).max(1_000_000_000_000),
});

/** One event from the browser. The path has a language prefix and no query string or fragment. */
export const browserEventInput = z.object({
  eventId: z.string().min(8).max(100),
  name: z.enum(BROWSER_EVENT_NAMES),
  occurredAt: z.iso.datetime(),
  url: z
    .string()
    .max(500)
    .regex(/^\/[^?#]*$/, 'Path must start with "/" and carry no query string')
    .refine((path) => localeOfPath(path) !== null, 'Path must start with a language prefix'),
  valueMinor: z.number().int().min(0).max(1_000_000_000_000).optional(),
  items: z.array(browserItemInput).max(MAX_ITEMS).optional(),
  orderId: z.string().min(1).max(64).optional(),
});

/** Body of POST /api/events. */
export const trackEventsInput = z.object({
  events: z.array(browserEventInput).min(1).max(MAX_EVENTS_PER_REQUEST),
});

/** One browser event after validation. */
export type BrowserEventInput = z.infer<typeof browserEventInput>;
