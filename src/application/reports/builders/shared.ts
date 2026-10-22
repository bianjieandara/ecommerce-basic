// Helpers the report builders share: cell and KPI constructors, the average and ratio rules, and the grouping of days into buckets.
// Every builder uses these, so a rate or an average is computed the same way in every report.
import { bucketOf, shiftDay } from '../ranges';
import type { ReportRange } from '../ports';
import type { Grain, ReportFilters } from '../ports';
import type { CellValue, ReportKpi, ReportTable, ReportTextKey, ReportView, ReportKind } from '../view';
import { changeBp } from '../view';

/** What a builder knows besides its data. */
export interface BuildContext {
  range: ReportRange;
  /** The period before the range, for the KPI deltas; null for reports that compare nothing. */
  previous: ReportRange | null;
  filters: ReportFilters;
  /** Length of the slow-mover window, in days (for the note). */
  slowMoverDays: number;
}

/**
 * A money cell.
 * @param minor Amount in minor units.
 * @returns The cell.
 */
export const money = (minor: number): CellValue => ({ kind: 'money', minor });

/**
 * A count cell.
 * @param value Whole number.
 * @returns The cell.
 */
export const count = (value: number): CellValue => ({ kind: 'count', value });

/**
 * A percentage cell, from basis points, or an empty cell when there is no basis to show a rate of.
 * @param value Basis points, or null.
 * @returns The cell.
 */
export const rate = (value: number | null): CellValue =>
  value === null ? { kind: 'empty' } : { kind: 'bp', value };

/**
 * A text cell.
 * @param value Text (names, codes); not translated.
 * @returns The cell.
 */
export const text = (value: string): CellValue => ({ kind: 'text', value });

/**
 * A day cell (store-local, YYYY-MM-DD).
 * @param value Day.
 * @returns The cell.
 */
export const day = (value: string): CellValue => ({ kind: 'day', value });

/**
 * The integer value of a numeric cell, or zero for anything else.
 * @param cell The cell.
 * @returns The number.
 */
export function numberOf(cell: CellValue): number {
  if (cell.kind === 'money') return cell.minor;
  if (cell.kind === 'count' || cell.kind === 'bp') return cell.value;
  return 0;
}

/**
 * Average of a total over a count, rounded to whole minor units. Zero when nothing was counted.
 * @param total Sum.
 * @param n Number of items.
 * @returns The average.
 */
export function average(total: number, n: number): number {
  return n > 0 ? Math.round(total / n) : 0;
}

/**
 * A ratio in basis points (part of whole), or null when the whole is zero.
 * @param part Numerator.
 * @param whole Denominator.
 * @returns Basis points, rounded half up, or null.
 */
export function ratioBp(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part * 10_000) / whole);
}

/**
 * A KPI card. The change is computed when both values are numbers of the same kind and the previous value is not zero.
 * @param label Translated label key.
 * @param value Value of the period.
 * @param previous Value of the period before, or null when the report compares nothing.
 * @returns The card.
 */
export function kpi(label: ReportTextKey, value: CellValue, previous: CellValue | null): ReportKpi {
  const change =
    previous &&
    previous.kind === value.kind &&
    (value.kind === 'money' || value.kind === 'count' || value.kind === 'bp')
      ? changeBp(numberOf(value), numberOf(previous))
      : null;
  return { label, value, previous, changeBp: change };
}

/**
 * Builds a KPI from one reader: the same function runs on the period and on the one before it.
 * @param label Translated label key.
 * @param previous Previous-period data, or null.
 * @param current Current-period data.
 * @param read Reads the value from the data.
 * @returns The card.
 */
export function kpiFrom<T>(
  label: ReportTextKey,
  current: T,
  previous: T | null,
  read: (data: T) => CellValue,
): ReportKpi {
  return kpi(label, read(current), previous === null ? null : read(previous));
}

/**
 * The series of a period: one accumulator per bucket of the grouping, every bucket of the period present (days without rows
 * stay at zero, so a chart has no gaps), in bucket order. Rows are added to the bucket of their day.
 * @param range The period.
 * @param grain Grouping.
 * @param rows Rows with a store-local day.
 * @param empty Starts an accumulator.
 * @param add Adds one row to an accumulator.
 * @returns The accumulators by bucket start day.
 */
export function seriesOf<R extends { day: string }, A>(
  range: ReportRange,
  grain: Grain,
  rows: R[],
  empty: () => A,
  add: (acc: A, row: R) => void,
): Map<string, A> {
  const series = new Map<string, A>();
  const ensure = (key: string): A => {
    const existing = series.get(key);
    if (existing !== undefined) return existing;
    const fresh = empty();
    series.set(key, fresh);
    return fresh;
  };
  for (let current = range.from; current <= range.to; current = shiftDay(current, 1)) {
    ensure(bucketOf(current, grain));
  }
  for (const row of rows) add(ensure(bucketOf(row.day, grain)), row);
  return series;
}

/**
 * A table of rows, with its total.
 * @param id Name in the CSV link.
 * @param title Translated title key.
 * @param columns Translated header keys, in cell order.
 * @param rows Cells of each row.
 * @param total Rows matching in all (defaults to the rows given).
 * @returns The table.
 */
export function tableOf(
  id: string,
  title: ReportTextKey,
  columns: ReportTextKey[],
  rows: CellValue[][],
  total: number = rows.length,
): ReportTable {
  return { id, title, columns, rows, total };
}

/**
 * Assembles a view.
 * @param kind The report.
 * @param parts Its parts.
 * @returns The view.
 */
export function viewOf(
  kind: ReportKind,
  parts: Pick<ReportView, 'kpis' | 'chart' | 'tables' | 'notes'>,
): ReportView {
  return { kind, ...parts };
}
