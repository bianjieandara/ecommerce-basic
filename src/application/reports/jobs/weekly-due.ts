// The weekly summary's schedule. The scheduler calls this on every cron tick; it says whether the store's configured weekday and
// hour (in the store's time zone) have arrived, and the key that makes the job run once for that day.
import type { SettingsMap } from '@/application/content/settings-schemas';
import { localDay } from '../ranges';

/** Short English weekday names, as Intl prints them, mapped to 0 (Sunday) to 6 (Saturday). */
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Whether the weekly summary is due at an instant.
 * @param settings The reports settings group.
 * @param nowIso The instant of the tick.
 * @param timeZone The store's time zone.
 * @returns The job's idempotency key when the summary is due, or null when it is off or not yet due. The key names the store-local
 *   day, so ticks within the same hour enqueue one job.
 */
export function weeklySummaryDue(
  settings: SettingsMap['reports'],
  nowIso: string,
  timeZone: string,
): string | null {
  if (!settings.weeklySummaryEnabled) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowIso));
  const weekday = WEEKDAYS[parts.find((part) => part.type === 'weekday')?.value ?? ''];
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  if (weekday !== settings.weeklySummaryWeekday || hour !== settings.weeklySummaryHour) return null;
  return `weekly-summary:${localDay(nowIso, timeZone)}`;
}
