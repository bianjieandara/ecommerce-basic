// Moves the times of a restored snapshot forward, so the demo always shows recent activity: an order placed a day before the
// snapshot was taken appears a day before the reset, whenever the reset runs.

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/**
 * Shifts every ISO instant in a row by a number of milliseconds. Other values are left as they are.
 * @param row One row, column name to value.
 * @param deltaMs Milliseconds to add.
 * @returns A new row with the shifted instants.
 */
export function shiftInstants(row: Record<string, unknown>, deltaMs: number): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      column,
      typeof value === 'string' && ISO_INSTANT.test(value)
        ? new Date(Date.parse(value) + deltaMs).toISOString()
        : value,
    ]),
  );
}

/**
 * Moves a calendar day (YYYY-MM-DD) by whole days. Used for the daily metrics, which are keyed by day.
 * @param day Day as written in the database.
 * @param deltaMs Milliseconds since the snapshot; rounded to whole days.
 * @returns The shifted day, or the input when it is not a day.
 */
export function shiftDay(day: string, deltaMs: number): string {
  if (!DAY.test(day)) return day;
  const moved = new Date(Date.parse(`${day}T00:00:00Z`) + Math.round(deltaMs / DAY_MS) * DAY_MS);
  return moved.toISOString().slice(0, 10);
}
