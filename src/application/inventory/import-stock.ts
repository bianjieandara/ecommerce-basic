// ImportStock: applies a stock CSV. The file is checked row by row before anything is written, so the preview and the import
// agree. The rows that can apply then go through in batches of 50: one D1 batch each, with the ledger rows tagged with the
// import's id.
import { chunk } from '@/domain/shared/chunk';
import { CURRENCIES } from '@/domain/shared/currency';
import { DomainError } from '@/domain/shared/errors';
import type { Locale } from '@/domain/shared/locale';
import type { SettingsRepository } from '../ports/content';
import type { InventoryRepository, InventoryRow, StockChange } from '../ports/inventory';
import type { Clock, IdGenerator } from '../ports/platform';
import type { EvaluateStockChanges } from './evaluate-stock-changes';
import { parseStockImport, type StockImportLine } from './stock-import';

/** Rows per D1 batch, and SKUs per lookup query. Keeps every statement under D1's limits. */
const BATCH_SIZE = 50;

/** One row of a preview or an import. */
export interface ImportRowResult {
  line: number;
  sku: string;
  status: 'ok' | 'error';
  message: string | null;
  /** Stock on record before the row, and after it. Null for rows that cannot apply. */
  before: number | null;
  after: number | null;
}

/** Result of a preview or of an import. */
export interface ImportStockResult {
  dryRun: boolean;
  /** Id shared by the ledger rows of an applied import; null for a preview. */
  batchId: string | null;
  /** Rows that are applied, or that would be applied by a preview. */
  applied: number;
  rows: ImportRowResult[];
}

/** Dependencies of ImportStock. */
export interface ImportStockDeps {
  inventory: InventoryRepository;
  settings: SettingsRepository;
  evaluate: EvaluateStockChanges;
  ids: IdGenerator;
  clock: Clock;
}

/** A row that can apply: its variant, the change it makes, and its result line. */
interface Pending {
  line: StockImportLine;
  variant: InventoryRow;
  delta: number;
  result: ImportRowResult;
}

/** Imports stock counts and changes from CSV files. */
export class ImportStock {
  /** @param deps Repository, settings, alert evaluation, ids and clock. */
  constructor(private readonly deps: ImportStockDeps) {}

  /**
   * Checks the file and, unless it is a preview, applies its rows that can apply.
   * @param text CSV contents.
   * @param actorId Admin who imports.
   * @param options `dryRun`: report what would happen and change nothing.
   * @returns The row results and, for an import, the batch id.
   * @throws DomainError VALIDATION_FAILED for an unusable header or too many rows.
   */
  async execute(text: string, actorId: string, options: { dryRun: boolean }): Promise<ImportStockResult> {
    const [general, inventory] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('inventory'),
    ]);
    const { lines, issues } = parseStockImport(text, CURRENCIES[general.currency].exponent);
    const variants = await this.bySku(
      lines.map((line) => line.sku),
      general.defaultLocale,
      inventory.defaultLowStockThreshold,
    );

    const pending: Pending[] = [];
    const rows: ImportRowResult[] = issues.map((issue) => failedRow(issue.line, issue.sku, issue.message));
    for (const line of lines) {
      const variant = variants.get(line.sku);
      if (!variant) {
        rows.push(failedRow(line.line, line.sku, 'Unknown SKU'));
        continue;
      }
      const problem = problemOf(line, variant);
      if (problem !== null) {
        rows.push(failedRow(line.line, line.sku, problem));
        continue;
      }
      const delta = line.mode === 'set' ? line.quantity - variant.stock : line.quantity;
      const result: ImportRowResult = {
        line: line.line,
        sku: line.sku,
        status: 'ok',
        message: null,
        before: variant.stock,
        after: variant.stock + delta,
      };
      pending.push({ line, variant, delta, result });
      rows.push(result);
    }
    rows.sort((a, b) => a.line - b.line);

    if (options.dryRun) {
      return { dryRun: true, batchId: null, applied: rows.filter((row) => row.status === 'ok').length, rows };
    }

    const batchId = this.deps.ids.newId();
    const nowIso = this.deps.clock.now().toISOString();
    const changes: StockChange[] = [];
    for (const group of chunk(
      pending.filter((item) => item.delta !== 0),
      BATCH_SIZE,
    )) {
      try {
        const applied = await this.deps.inventory.adjust(
          group.map((item) => ({
            variantId: item.variant.variantId,
            delta: item.delta,
            reason: 'import',
            reference: batchId,
            note: item.line.note ?? undefined,
          })),
          { actorId, nowIso },
        );
        changes.push(...applied);
      } catch (error) {
        // A stock that moved since the file was checked makes the batch refuse. Its rows fail; the others still apply.
        if (!(error instanceof DomainError && error.code === 'OUT_OF_STOCK')) throw error;
        for (const item of group) {
          item.result.status = 'error';
          item.result.message = 'Stock changed during the import. Run the import again.';
          item.result.before = null;
          item.result.after = null;
        }
      }
    }
    await this.deps.evaluate.execute(changes);

    const costs = pending.flatMap((item) =>
      item.result.status === 'ok' && item.line.costMinor !== null
        ? [{ variantId: item.variant.variantId, costMinor: item.line.costMinor }]
        : [],
    );
    await this.deps.inventory.setCosts(costs);

    return {
      dryRun: false,
      batchId,
      applied: rows.filter((row) => row.status === 'ok').length,
      rows,
    };
  }

  /**
   * Loads the variants named in the file, by SKU, in batches.
   * @param skus SKUs of the file.
   * @param locale Language of the names.
   * @param defaultThreshold Store default low-stock threshold.
   * @returns The variants by SKU.
   */
  private async bySku(
    skus: string[],
    locale: Locale,
    defaultThreshold: number,
  ): Promise<Map<string, InventoryRow>> {
    const found = new Map<string, InventoryRow>();
    for (const group of chunk([...new Set(skus)], BATCH_SIZE)) {
      for (const row of await this.deps.inventory.findVariantsBySku(group, locale, defaultThreshold)) {
        if (row.sku !== null) found.set(row.sku, row);
      }
    }
    return found;
  }
}

/**
 * The reason a line cannot apply to its variant, or null when it can.
 * @param line The row.
 * @param variant Its variant.
 * @returns A message, or null.
 */
function problemOf(line: StockImportLine, variant: InventoryRow): string | null {
  if (!variant.tracked) return 'This variant does not track stock';
  const delta = line.mode === 'set' ? line.quantity - variant.stock : line.quantity;
  if (variant.stock + delta < 0) return 'Stock cannot go below zero';
  return null;
}

/**
 * A row that cannot apply.
 * @param line Line number in the file.
 * @param sku SKU as written.
 * @param message Why it cannot apply.
 * @returns The result row.
 */
function failedRow(line: number, sku: string, message: string): ImportRowResult {
  return { line, sku, status: 'error', message, before: null, after: null };
}
