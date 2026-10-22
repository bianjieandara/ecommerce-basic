// Day arithmetic for the dashboard, in the store's time zone. The database stores instants; the owner thinks in local days.

/** Milliseconds in a day, for the rolling periods. */
const DAY_MS = 86_400_000;

/**
 * The store-local calendar day of an instant.
 * @param iso Instant.
 * @param timeZone IANA time zone of the store.
 * @returns The day as YYYY-MM-DD.
 */
export function localDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/**
 * How far the store's clock is ahead of UTC at an instant, in minutes (negative when behind, as in Colombia).
 * SQLite's date modifiers take this value, so the chart groups orders by store-local day.
 * @param iso Instant.
 * @param timeZone IANA time zone of the store.
 * @returns Offset in minutes.
 */
export function offsetMinutes(iso: string, timeZone: string): number {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const field = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const localAsUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour'),
    field('minute'),
    field('second'),
  );
  return Math.round((localAsUtc - date.getTime()) / 60_000);
}

/**
 * Adds calendar days to a store-local day.
 * @param day YYYY-MM-DD.
 * @param days Days to add; negative to go back.
 * @returns The resulting YYYY-MM-DD.
 */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + days)).toISOString().slice(0, 10);
}

/**
 * A rolling period: the instant `days` days before another one.
 * @param iso Instant the period ends at.
 * @param days Length of the period in days.
 * @returns The starting instant.
 */
export function daysBefore(iso: string, days: number): string {
  return new Date(Date.parse(iso) - days * DAY_MS).toISOString();
}
