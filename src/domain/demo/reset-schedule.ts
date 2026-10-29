// When the demo store restores its snapshot. Two rules, not one. A store that has never restored does it on the next
// tick: it has nothing to show and nobody to disturb, and its shared login does not exist yet, because the reset is what
// writes it. After that it restores once a day, in the early morning of the store's time zone, when few people are
// looking. The scheduler calls this on every cron tick and uses the marker it returns so the period's later ticks do not
// repeat the work.

/** Hour (store time) from which the daily reset may run. */
export const DEMO_RESET_HOUR = 3;

/** How long the daily marker lives: a day and an hour, so the day's ticks all see it. */
const DAY_MARKER_SECONDS = 25 * 3600;

/** The cron tick, in milliseconds. The first restore is marked for one tick, so a failed one is retried on the next. */
const TICK_MS = 900_000;

/** A reset that is due: the marker that keeps it from being queued twice, and how long that marker should live. */
export interface DemoResetDue {
  /** Idempotency key of the job and name of the marker. */
  key: string;
  /** How long to keep the marker, which is how long the reset stays "already queued". */
  markerSeconds: number;
}

/**
 * Whether the demo reset is due at an instant.
 * @param nowIso The instant of the tick.
 * @param timeZone The store's time zone.
 * @param enabled Whether demo mode is on for this store.
 * @param hasRestored Whether this store has ever restored a snapshot.
 * @returns What to queue and how long to mark it, or null when demo mode is off or it is too early.
 */
export function demoResetDue(
  nowIso: string,
  timeZone: string,
  enabled: boolean,
  hasRestored: boolean,
): DemoResetDue | null {
  if (!enabled) return null;
  // A store that has never restored is blank: no settings, no catalogue, and no shared account to sign in with and ask
  // for a reset by hand. Waiting for the small hours would leave a newly deployed demo empty for up to a day, so it
  // restores now and tries again every tick until it works. That also means publishing a snapshot to a demo that has
  // none shows up within the quarter hour instead of the next night.
  if (!hasRestored) {
    return {
      key: `demo-reset:first:${Math.floor(Date.parse(nowIso) / TICK_MS)}`,
      markerSeconds: TICK_MS / 1000,
    };
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowIso));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  if (Number(part('hour')) < DEMO_RESET_HOUR) return null;
  return {
    key: `demo-reset:${part('year')}-${part('month')}-${part('day')}`,
    markerSeconds: DAY_MARKER_SECONDS,
  };
}
