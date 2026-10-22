// Store-local days in list filters. A filter names days (YYYY-MM-DD) in the store's time zone; the queries compare instants, so the
// days are turned into instants here, once, for every admin list.
import { dayAfterStartUtc, dayStartUtc } from '@/domain/shared/day-bounds';

/** The shape of a filter day. */
const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether a filter value is a day that exists, such as 2026-10-22 (not 2026-13-45).
 * @param value Text from the query string.
 * @returns True for a real calendar day.
 */
function isDay(value: string | null): value is string {
  return value !== null && DAY_TEXT.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * A filter day that exists, for a form to show again; null for a missing or invalid one.
 * @param value Text from the query string.
 * @returns The day, or null.
 */
export function filterDay(value: string | null): string | null {
  return isDay(value) ? value : null;
}

/**
 * Turns the first and last day of a filter into instants. The first day starts at its first instant; the last day runs until
 * the first instant of the next day, so it is included in full.
 * @param from First day, or any text (a missing or invalid day means no lower bound).
 * @param to Last day, or any text (a missing or invalid day means no upper bound).
 * @param timeZone Store time zone.
 * @returns Lower bound (inclusive) and upper bound (exclusive), each null when open.
 */
export function dayRangeBounds(
  from: string | null,
  to: string | null,
  timeZone: string,
): { from: string | null; to: string | null } {
  return {
    from: isDay(from) ? dayStartUtc(from, timeZone) : null,
    to: isDay(to) ? dayAfterStartUtc(to, timeZone) : null,
  };
}
