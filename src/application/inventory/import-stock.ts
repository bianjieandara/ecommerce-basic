// ImportStock: applies a stock CSV. The file is checked row by row before anything is written, so the preview and the import
// agree. The rows that can apply then go through in batches of 50: one D1 batch each, with the ledger rows tagged with the
// import's id. A batch that fails never stops the others, and the result always says which rows went in.
import { planStockChange } from '@/domain/inventory/stock';
import { chunk } from '@/domain/shared/chunk';
import { CURRENCIES } from '@/domain/shared/currency';
import { DomainError } from '@/domain/shared/errors';
import type { SettingsRepository } from '../ports/content';
import type { InventoryRepository, InventoryRow, StockChange, StockDelta } from '../ports/inventory';
import type { Clock, IdGenerator } from '../ports/platform';
import type { EvaluateStockChanges } from './evaluate-stock-changes';
import { parseStockImport, type ImportRowCode, type StockImportLine } from './stock-import';

/** Rows per D1 batch. */
const BATCH_SIZE = 50;

/** One row of a preview or an import. */
export interface ImportRowResult {
  line: number;
  sku: string;
  status: 'ok' | 'error';
  /** Why the row cannot apply; null for rows that can. The screen translates it. */
  code: ImportRowCode | null;
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
   * @throws DomainError VALIDATION_FAILED for an unusable header or too many rows (before anything is written).
   */
  async execute(text: string, actorId: string, options: { dryRun: boolean }): Promise<ImportStockResult> {
    const [general, inventory] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('inventory'),
    ]);
    const { lines, issues } = parseStockImport(text, CURRENCIES[general.currency].exponent);
    // One query for every SKU of the file: the list travels as a single JSON parameter.
    const found = await this.deps.inventory.findVariantsBySku(
      [...new Set(lines.map((line) => line.sku))],
      general.defaultLocale,
      inventory.defaultLowStockThreshold,
    );
    const variants = new Map(found.flatMap((row) => (row.sku === null ? [] : [[row.sku, row] as const])));

    const pending: Pending[] = [];
    const rows: ImportRowResult[] = issues.map((issue) => failedRow(issue.line, issue.sku, issue.code));
    for (const line of lines) {
      const variant = variants.get(line.sku);
      if (!variant) {
        rows.push(failedRow(line.line, line.sku, 'sku_unknown'));
        continue;
      }
      const plan = planStockChange({
        tracked: variant.tracked,
        stock: variant.stock,
        mode: line.mode,
        quantity: line.quantity,
      });
      if ('problem' in plan) {
        rows.push(failedRow(line.line, line.sku, plan.problem));
        continue;
      }
      const result: ImportRowResult = {
        line: line.line,
        sku: line.sku,
        status: 'ok',
        code: null,
        before: variant.stock,
        after: variant.stock + plan.delta,
      };
      pending.push({ line, variant, delta: plan.delta, result });
      rows.push(result);
    }
    rows.sort((a, b) => a.line - b.line);

    if (options.dryRun) {
      return { dryRun: true, batchId: null, applied: rows.filter((row) => row.status === 'ok').length, rows };
    }

    const batchId = this.deps.ids.newId();
    const nowIso = this.deps.clock.now().toISOString();
    const changes: StockChange[] = [];
    // Each group commits on its own. A group that fails is recorded in its rows and the others still run, so the result
    // always says what went in; running the whole file again would apply the "add" rows of the earlier groups twice.
    for (const group of chunk(
      pending.filter((item) => item.delta !== 0),
      BATCH_SIZE,
    )) {
      try {
        changes.push(
          ...(await this.deps.inventory.adjust(
            group.map((item): StockDelta => ({
              variantId: item.variant.variantId,
              delta: item.delta,
              reason: 'import',
              reference: batchId,
              note: item.line.note ?? undefined,
              ...(item.line.costMinor !== null && { costMinor: item.line.costMinor }),
            })),
            { actorId, nowIso },
          )),
        );
      } catch (error) {
        const stale = error instanceof DomainError && error.code === 'OUT_OF_STOCK';
        for (const item of group) markFailed(item.result, stale ? 'stock_changed' : 'batch_failed');
      }
    }
    await this.deps.evaluate.execute(changes);

    // Rows that keep their stock but carry a cost: nothing moved, so there is no ledger row, only the cost to save.
    const costOnly = pending.filter((item) => item.delta === 0 && item.line.costMinor !== null);
    for (const group of chunk(costOnly, BATCH_SIZE)) {
      try {
        await this.deps.inventory.setCosts(
          group.flatMap((item) =>
            item.line.costMinor === null
              ? []
              : [{ variantId: item.variant.variantId, costMinor: item.line.costMinor }],
          ),
        );
      } catch {
        for (const item of group) markFailed(item.result, 'batch_failed');
      }
    }

    return {
      dryRun: false,
      batchId,
      applied: rows.filter((row) => row.status === 'ok').length,
      rows,
    };
  }
}

/**
 * A row that cannot apply.
 * @param line Line number in the file.
 * @param sku SKU as written.
 * @param code Why it cannot apply.
 * @returns The result row.
 */
function failedRow(line: number, sku: string, code: ImportRowCode): ImportRowResult {
  return { line, sku, status: 'error', code, before: null, after: null };
}

/**
 * Marks a row that was ready as not applied.
 * @param result The row's result, changed in place.
 * @param code Why it was not applied.
 */
function markFailed(result: ImportRowResult, code: ImportRowCode): void {
  result.status = 'error';
  result.code = code;
  result.before = null;
  result.after = null;
}
