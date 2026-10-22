// TrackEvent: records the events a browser sends (POST /api/events). Each event goes to the Analytics Engine writer; the server
// writes page_view only, so view_item comes from here alone. With marketing consent and the Conversions API on,
// each event also becomes a Meta job that carries the browser's event id, so Meta counts the pixel and the server event once.
import { localeOfPath, type BrowserEventName } from '@/domain/analytics/tracked-events';
import { DEFAULT_LOCALE } from '@/domain/shared/locale';
import type { CurrencyCode } from '@/domain/shared/currency';
import { money } from '@/domain/shared/money';
import type { AnalyticsWriter, ConversionEvent, TrackedEvent, TrackedItem } from '../ports/analytics';
import type { SettingsRepository } from '../ports/content';
import type { EnqueueOptions, JobQueue, JobType } from '../ports/jobs';
import type { Clock, LogEvent } from '../ports/platform';

/** Meta accepts an event only when it is at most seven days old. Older events are not sent to Meta. */
const META_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Tolerance for a browser clock that runs ahead of the server. */
const FUTURE_TOLERANCE_MS = 60 * 1000;

/** One browser event, validated by trackEventsInput. */
export interface BrowserEvent {
  eventId: string;
  name: BrowserEventName;
  occurredAt: string;
  url: string;
  valueMinor?: number;
  items?: TrackedItem[];
  orderId?: string;
}

/** Dependencies of TrackEvent. */
export interface TrackEventDeps {
  analytics: AnalyticsWriter;
  jobs: JobQueue;
  settings: SettingsRepository;
  clock: Clock;
  log: LogEvent;
}

/** Result of one batch. */
export interface TrackEventResult {
  accepted: number;
}

/** Records browser events. Nothing here fails the request: analytics is best effort. */
export class TrackEvent {
  /** @param deps Writers, queue, settings and clock. */
  constructor(private readonly deps: TrackEventDeps) {}

  /**
   * Records one batch.
   * @param events Validated events.
   * @param context Request context (country, device, consent and so on). Consent is read by the caller from the cookie.
   * @returns How many events were accepted.
   */
  async execute(events: BrowserEvent[], context: TrackedEvent['context']): Promise<TrackEventResult> {
    const [general, marketing] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('marketing'),
    ]);
    for (const event of events) {
      this.deps.analytics.write({
        id: event.eventId,
        name: event.name,
        occurredAt: event.occurredAt,
        url: event.url,
        locale: localeOfPath(event.url) ?? DEFAULT_LOCALE,
        ...(event.valueMinor !== undefined ? { value: money(event.valueMinor, general.currency) } : {}),
        ...(event.items ? { items: event.items } : {}),
        ...(event.orderId ? { orderId: event.orderId } : {}),
        context,
      });
    }
    if (context.marketingConsent && marketing.metaCapiEnabled) {
      await this.enqueueForMeta(events, context, general.currency);
    }
    return { accepted: events.length };
  }

  /**
   * Queues one Meta job per event that Meta can still accept. A failure to queue is logged, never thrown.
   * @param events Validated events.
   * @param context Request context.
   * @param currency Store currency.
   */
  private async enqueueForMeta(
    events: BrowserEvent[],
    context: TrackedEvent['context'],
    currency: CurrencyCode,
  ): Promise<void> {
    const now = this.deps.clock.now().getTime();
    const jobs = events
      .filter((event) => isRecent(event.occurredAt, now))
      .map((event): { type: JobType; payload: ConversionEvent; options: EnqueueOptions } => ({
        type: 'marketing.meta_capi',
        payload: conversionOf(event, context, currency),
        options: { idempotencyKey: `capi:${event.eventId}` },
      }));
    if (jobs.length === 0) return;
    try {
      await this.deps.jobs.enqueueMany(jobs);
    } catch (error) {
      this.deps.log('meta_capi.enqueue_failed', {
        count: jobs.length,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}

/**
 * Whether an event time is inside the window Meta accepts.
 * @param occurredAt ISO time sent by the browser.
 * @param nowMs Server time in milliseconds.
 * @returns True when the event is recent enough to send.
 */
function isRecent(occurredAt: string, nowMs: number): boolean {
  const at = Date.parse(occurredAt);
  return !Number.isNaN(at) && at >= nowMs - META_MAX_AGE_MS && at <= nowMs + FUTURE_TOLERANCE_MS;
}

/**
 * Builds the Conversions API event of one browser event. Browser events carry no customer data, so only the request's
 * network identifiers and the pixel cookies travel with it.
 * @param event Validated browser event.
 * @param context Request context.
 * @param currency Store currency.
 * @returns The event as the job queue carries it.
 */
function conversionOf(
  event: BrowserEvent,
  context: TrackedEvent['context'],
  currency: CurrencyCode,
): ConversionEvent {
  return {
    eventId: event.eventId,
    name: event.name,
    occurredAt: event.occurredAt,
    path: event.url,
    currency,
    valueMinor: event.valueMinor ?? null,
    items: event.items ?? [],
    orderId: event.orderId ?? null,
    ip: context.ip,
    userAgent: context.userAgent,
    fbp: context.fbp ?? null,
    fbc: context.fbc ?? null,
    email: null,
    phone: null,
  };
}
