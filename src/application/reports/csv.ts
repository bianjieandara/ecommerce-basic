// A report table as a CSV file. Amounts are written in major units with a dot, so the file reads the same in a spreadsheet as on the
// screen. The headers are translated by the caller, which owns the dictionaries; this module only lays the cells out.
import { toCsv, type CsvCell } from '../documents/csv';
import { CURRENCIES, type CurrencyCode } from '@/domain/shared/currency';
import { majorTextFromMinor } from '@/domain/shared/money';
import type { CellValue, ReportTextKey, ReportView } from './view';

/** A CSV file ready to download. */
export interface ReportCsv {
  filename: string;
  text: string;
}

/**
 * One cell as text or a number for the file.
 * @param cell Cell of the view.
 * @param exponent Decimal digits of the store currency.
 * @returns The value written to the file.
 */
function csvCell(cell: CellValue, exponent: number, decimal: '.' | ','): CsvCell {
  switch (cell.kind) {
    case 'money':
      return majorTextFromMinor(cell.minor, exponent).replace('.', decimal);
    case 'count':
      return cell.value;
    case 'bp':
      return (cell.value / 100).toFixed(2).replace('.', decimal);
    case 'text':
    case 'day':
      return cell.value;
    case 'empty':
      return null;
  }
}

/**
 * The decimal character for a separator. A semicolon file is read by a Spanish-locale spreadsheet, which expects a comma.
 * @param separator Column separator of the file.
 * @returns The decimal character.
 */
function decimalOf(separator: ',' | ';' | undefined): '.' | ',' {
  return separator === ';' ? ',' : '.';
}

/**
 * Writes one table of a report. The table is the one named, or the first one when none is.
 * @param view The report's view.
 * @param options Which table, the period it covers, the currency and the header translator.
 * @returns The file, or null when the report has no such table.
 */
export function reportCsv(
  view: ReportView,
  options: {
    table: string | null;
    from: string;
    to: string;
    currency: CurrencyCode;
    label: (key: ReportTextKey) => string;
    /** ';' for Spanish-locale Excel, which reads a comma as the decimal point and a semicolon as the column separator. */
    separator?: ',' | ';';
  },
): ReportCsv | null {
  const table =
    options.table === null ? view.tables[0] : view.tables.find((item) => item.id === options.table);
  if (!table) return null;
  const exponent = CURRENCIES[options.currency].exponent;
  return {
    filename: `${view.kind}-${table.id}-${options.from}-${options.to}.csv`,
    text: toCsv(
      table.columns.map(options.label),
      table.rows.map((row) => row.map((cell) => csvCell(cell, exponent, decimalOf(options.separator)))),
      options.separator ?? ',',
    ),
  };
}
