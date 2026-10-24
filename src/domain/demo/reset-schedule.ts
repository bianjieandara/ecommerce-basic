// When the demo store restores its snapshot: once a day, in the early morning of the store's time zone, when few people are
// looking. The scheduler calls this on every cron tick; the key makes the reset run once per day.

/** Hour (store time) from which the reset may run. */
export const DEMO_RESET_HOUR = 3;

/**
 * Whether the nightly demo reset is due at an instant.
 * @param nowIso The instant of the tick.
 * @param timeZone The store's time zone.
 * @param enabled Whether demo mode is on for this store.
 * @returns The key of today's reset (store-local day) once it is due, or null when demo mode is off or it is too early.
 */
export function demoResetDue(nowIso: string, timeZone: string, enabled: boolean): string | null {
  if (!enabled) return null;
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
  return `demo-reset:${part('year')}-${part('month')}-${part('day')}`;
}
