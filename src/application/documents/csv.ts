// CSV reading and writing (RFC 4180). Files start with a UTF-8 byte-order mark so Excel opens accents correctly, and a cell
// that a spreadsheet would read as a formula is prefixed so an exported name can never run as code.

/** Byte-order mark (U+FEFF) that tells spreadsheets the file is UTF-8. Written as an escape so no editor can drop it. */
const BOM = '\uFEFF';

/** One cell of a file written by toCsv. */
export type CsvCell = string | number | null;

/**
 * Picks the delimiter from the header line. Excel saves with a semicolon wherever the decimal separator is a comma (Spanish
 * and most of Latin America), so a file edited there would otherwise read as one column. Quoted text is skipped.
 * @param source CSV text without a byte-order mark.
 * @returns ';' when the header has more semicolons than commas, else ','.
 */
function detectDelimiter(source: string): ',' | ';' {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of source) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && char === ',') commas += 1;
    else if (!quoted && char === ';') semicolons += 1;
  }
  return semicolons > commas ? ';' : ',';
}

/**
 * Parses CSV text into rows of cells. Handles quoted cells with commas, line breaks and doubled quotes, and accepts LF and
 * CRLF line endings. The delimiter is a comma, or a semicolon when the header line uses one. Blank lines are dropped.
 * @param text CSV text, with or without a byte-order mark.
 * @returns The rows of cells.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const delimiter = detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (quoted) {
      if (char === '"' && source.charAt(index + 1) === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source.charAt(index + 1) === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => !(cells.length === 1 && cells[0] === ''));
}

/**
 * Builds a CSV file: the header first, then the rows.
 * @param header Column names.
 * @param rows Cells per row, in header order.
 * @returns The file text, with a byte-order mark and CRLF line endings.
 */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header, ...rows].map((cells) => cells.map(csvField).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** Text that a spreadsheet would read as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Undoes the guard toCsv puts on text that starts like a formula, so an exported file can be imported again unchanged.
 * @param cell Cell read from a file.
 * @returns The original text.
 */
export function unguardCell(cell: string): string {
  return cell.startsWith("'") && FORMULA_START.test(cell.slice(1)) ? cell.slice(1) : cell;
}

/**
 * Formats one cell: quotes it when needed, and guards text that starts like a formula.
 * @param cell Cell value.
 * @returns The cell as written in the file.
 */
function csvField(cell: CsvCell): string {
  if (cell === null) return '';
  if (typeof cell === 'number') return String(cell);
  const guarded = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}
