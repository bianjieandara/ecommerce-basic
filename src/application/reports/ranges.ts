// Report periods: store-local days from the query string, the previous period of the same length, and the grouping of days into
// weeks or months. Days are calendar days in the store's time zone; the database keeps instants, so each period is also given as
// the instants that bound it. The day arithmetic mirrors infrastructure/d1/dashboard-days.ts, which the application may not import.
import { dayAfterStartUtc, dayStartUtc } from '@/domain/shared/day-bounds';
import { GRAINS, type Grain, type ReportRange } from './ports';

/** Longest period a report reads, in days. Longer requests are cut to this length, so one page stays one bounded query. */
export const MAX_RANGE_DAYS = 366;

/** Days of the default period, ending today. */
export const DEFAULT_RANGE_DAYS = 30;

const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/**
 * The store-local calendar day of an instant.
 * @param iso Instant.
 * @param timeZone IANA zone of the store.
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
 * Adds calendar days to a day.
 * @param day YYYY-MM-DD.
 * @param days Days to add; negative to go back.
 * @returns The resulting YYYY-MM-DD.
 */
export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + days)).toISOString().slice(0, 10);
}

/**
 * Number of days from one day to another, both included.
 * @param from First day.
 * @param to Last day.
 * @returns The count (1 for a single day).
 */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/**
 * Builds the range of two store-local days, with the instants that bound it.
 * @param from First day (YYYY-MM-DD).
 * @param to Last day (YYYY-MM-DD), included.
 * @param timeZone IANA zone of the store.
 * @returns The range.
 */
export function rangeOf(from: string, to: string, timeZone: string): ReportRange {
  return {
    from,
    to,
    startIso: dayStartUtc(from, timeZone),
    endIso: dayAfterStartUtc(to, timeZone),
  };
}

/**
 * The period before a range, of the same number of days, ending the day before it starts.
 * @param range The current period.
 * @param timeZone IANA zone of the store.
 * @returns The previous period.
 */
export function previousRangeOf(range: ReportRange, timeZone: string): ReportRange {
  const to = shiftDay(range.from, -1);
  const from = shiftDay(to, -(daysBetween(range.from, range.to) - 1));
  return rangeOf(from, to, timeZone);
}

/**
 * Resolves the days a request asked for. A missing or invalid day falls back to the default (the last 30 days, ending today).
 * A reversed range is read as the default too, and a longer one is cut to MAX_RANGE_DAYS from its last day.
 * @param from Text from the query string.
 * @param to Text from the query string.
 * @param today The store-local day today.
 * @returns First and last day, both included.
 */
export function resolveDays(
  from: string | null,
  to: string | null,
  today: string,
): { from: string; to: string } {
  const validTo =
    to !== null && DAY_TEXT.test(to) && !Number.isNaN(Date.parse(`${to}T00:00:00Z`)) ? to : today;
  const validFrom =
    from !== null && DAY_TEXT.test(from) && !Number.isNaN(Date.parse(`${from}T00:00:00Z`)) ? from : null;
  if (validFrom === null || validFrom > validTo) {
    return { from: shiftDay(validTo, -(DEFAULT_RANGE_DAYS - 1)), to: validTo };
  }
  if (daysBetween(validFrom, validTo) > MAX_RANGE_DAYS) {
    return { from: shiftDay(validTo, -(MAX_RANGE_DAYS - 1)), to: validTo };
  }
  return { from: validFrom, to: validTo };
}

/**
 * The first day of the week (Monday) or the month that a store-local day belongs to, or the day itself.
 * @param day YYYY-MM-DD.
 * @param grain Grouping.
 * @returns The first day of the bucket.
 */
export function bucketOf(day: string, grain: Grain): string {
  if (grain === 'day') return day;
  if (grain === 'month') return `${day.slice(0, 7)}-01`;
  // Monday is day 1 of the week; Sunday (0) is the last day of the week that began six days earlier.
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

/**
 * Parses a grouping from the query string.
 * @param value Text from the query string.
 * @returns The grouping, or "day" for anything unknown.
 */
export function grainOf(value: string | null): Grain {
  return (GRAINS as readonly string[]).includes(value ?? '') ? (value as Grain) : 'day';
}

/**
 * The last `days` days ending on a day, for the period shortcuts.
 * @param today Last day (YYYY-MM-DD).
 * @param days Length of the period.
 * @returns First and last day.
 */
export function lastDays(today: string, days: number): { from: string; to: string } {
  return { from: shiftDay(today, -(days - 1)), to: today };
}
