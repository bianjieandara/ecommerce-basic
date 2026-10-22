// Calendar days in a store's time zone, as the UTC instants that bound them. Timestamps are stored in UTC, so a "day" filter
// that compares the UTC date would put an evening sale on the wrong day for a store in the Americas.

/**
 * Offset of a time zone from UTC at an instant, in milliseconds (negative west of Greenwich).
 * @param instantMs Instant, in milliseconds since the epoch.
 * @param timeZone IANA zone name, for example America/Bogota.
 * @returns The offset.
 */
function offsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instantMs));
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  // The formatted time has no milliseconds, so compare it with the instant cut to whole seconds.
  return local - Math.floor(instantMs / 1000) * 1000;
}

/**
 * The instant a calendar day starts in a time zone.
 * @param day Day as YYYY-MM-DD.
 * @param timeZone IANA zone name.
 * @returns ISO UTC instant of 00:00 that day in the zone.
 */
export function dayStartUtc(day: string, timeZone: string): string {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, date);
  // The zone's offset can differ at midnight from the offset at the first guess (daylight saving), so settle it twice.
  const first = guess - offsetMs(guess, timeZone);
  return new Date(guess - offsetMs(first, timeZone)).toISOString();
}

/**
 * The instant the day after a calendar day starts, so a range "from day A to day B, both included" is
 * `>= dayStartUtc(A)` and `< dayAfterStartUtc(B)`.
 * @param day Day as YYYY-MM-DD.
 * @param timeZone IANA zone name.
 * @returns ISO UTC instant of 00:00 on the next day in the zone.
 */
export function dayAfterStartUtc(day: string, timeZone: string): string {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
  return dayStartUtc(next, timeZone);
}
