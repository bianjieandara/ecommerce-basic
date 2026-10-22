// Format of a stock CSV: its columns, its limits and the rules each row must meet. The import use case and the admin preview
// both read files with this parser, so the preview shows exactly what an import would apply.
import type { StockProblem } from '@/domain/inventory/stock';
import { DomainError } from '@/domain/shared/errors';
import { minorFromMajorText } from '@/domain/shared/money';
import { parseCsv, unguardCell } from '../documents/csv';

/** Largest CSV file accepted, in bytes. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/**
 * Most data rows in one file. A row costs two statements. D1's limits page lists 1,000 queries per invocation on the paid
 * plan, while the Workers page lists 10,000 subrequests; 400 rows stay under the stricter figure even if every batched
 * statement counts as a query.
 */
export const MAX_IMPORT_ROWS = 400;

/** Largest absolute quantity in one row. Matches the adjustment schema. */
const MAX_QUANTITY = 1_000_000;

/** Columns the header must name. Cost and note are optional; any other column is ignored. */
const REQUIRED_COLUMNS = ['sku', 'mode', 'quantity'];

/** One row that can be applied. `line` is the 1-based line in the file, the header being line 1. */
export interface StockImportLine {
  line: number;
  sku: string;
  mode: 'set' | 'add';
  quantity: number;
  costMinor: number | null;
  note: string | null;
}

/** Why a row cannot be applied. The import screen translates these codes. */
export type ImportRowCode =
  | 'sku_required'
  | 'mode_invalid'
  | 'quantity_invalid'
  | 'quantity_too_large'
  | 'cost_invalid'
  | 'sku_duplicate'
  | 'sku_unknown'
  | StockProblem
  | 'stock_changed'
  | 'batch_failed';

/** A row that cannot be applied, with the reason. */
export interface StockImportIssue {
  line: number;
  sku: string;
  code: ImportRowCode;
}

/**
 * Reads a stock CSV. The header must name sku, mode and quantity, with cost and note optional and the columns in any order.
 * Other columns (product, variant, barcode) are ignored, so an exported file can be edited and imported again.
 * @param text File contents.
 * @param exponent Decimal places of the store currency, for the cost column.
 * @returns The rows that can be applied, and the rows with problems. A problem never stops the other rows.
 * @throws DomainError VALIDATION_FAILED when the header is unusable or the file has too many rows.
 */
export function parseStockImport(
  text: string,
  exponent: number,
): { lines: StockImportLine[]; issues: StockImportIssue[] } {
  const [header = [], ...body] = parseCsv(text);
  const columns = header.map((name) => name.trim().toLowerCase());
  const column = (name: string) => columns.indexOf(name);
  if (REQUIRED_COLUMNS.some((name) => column(name) < 0)) {
    throw new DomainError('VALIDATION_FAILED', 'The first row must name the columns sku, mode and quantity', {
      reason: 'import_header',
    });
  }
  const data = body
    .map((cells, offset) => ({ cells, line: offset + 2 }))
    .filter(({ cells }) => cells.some((cell) => cell.trim() !== ''));
  if (data.length > MAX_IMPORT_ROWS) {
    throw new DomainError('VALIDATION_FAILED', `A file holds at most ${MAX_IMPORT_ROWS} rows`, {
      reason: 'import_rows',
      max: MAX_IMPORT_ROWS,
    });
  }

  const lines: StockImportLine[] = [];
  const issues: StockImportIssue[] = [];
  const seen = new Set<string>();
  for (const { cells, line } of data) {
    const cell = (name: string) => (cells[column(name)] ?? '').trim();
    const parsed = readRow(line, cell, exponent);
    if ('code' in parsed) {
      issues.push({ line, sku: unguardCell(cell('sku')), code: parsed.code });
    } else if (seen.has(parsed.sku)) {
      issues.push({ line, sku: parsed.sku, code: 'sku_duplicate' });
    } else {
      seen.add(parsed.sku);
      lines.push(parsed);
    }
  }
  return { lines, issues };
}

/**
 * Checks one row and reads its values.
 * @param line Line number in the file.
 * @param cell Reads a column of this row by name.
 * @param exponent Decimal places of the store currency.
 * @returns The row, or the code of its first problem.
 */
function readRow(
  line: number,
  cell: (name: string) => string,
  exponent: number,
): StockImportLine | { code: ImportRowCode } {
  const sku = unguardCell(cell('sku'));
  if (!sku) return { code: 'sku_required' };
  const mode = cell('mode').toLowerCase();
  if (mode !== 'set' && mode !== 'add') return { code: 'mode_invalid' };
  const quantityText = cell('quantity');
  if (!/^-?\d+$/.test(quantityText)) return { code: 'quantity_invalid' };
  const quantity = Number(quantityText);
  if (Math.abs(quantity) > MAX_QUANTITY) return { code: 'quantity_too_large' };
  const costText = cell('cost');
  const costMinor = costText ? minorFromMajorText(costText, exponent) : null;
  if (costText && (costMinor === null || costMinor < 0)) return { code: 'cost_invalid' };
  const note = cell('note').slice(0, 200);
  return { line, sku, mode, quantity, costMinor, note: note || null };
}
