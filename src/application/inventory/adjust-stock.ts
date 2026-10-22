// AdjustStock: manual stock changes from the inventory screens. Each change writes a ledger row with its reason, its note and
// the admin who made it. The alerts are evaluated once the batch has applied.
import { DomainError } from '@/domain/shared/errors';
import type { SettingsRepository } from '../ports/content';
import type { InventoryRepository, InventoryRow, StockChange, StockDelta } from '../ports/inventory';
import type { Clock, IdGenerator } from '../ports/platform';
import type { EvaluateStockChanges } from './evaluate-stock-changes';
import type { AdjustStockInput } from './schemas';

/** Dependencies of AdjustStock. */
export interface AdjustStockDeps {
  inventory: InventoryRepository;
  settings: SettingsRepository;
  evaluate: EvaluateStockChanges;
  ids: IdGenerator;
  clock: Clock;
}

/** Applies manual stock changes and queues the alerts they cause. */
export class AdjustStock {
  /** @param deps Repository, settings, alert evaluation, ids and clock. */
  constructor(private readonly deps: AdjustStockDeps) {}

  /**
   * Adds, removes or sets stock for one or more variants. A "set" value becomes the difference from the stock on record, so a
   * variant already at its counted value is left out of the batch.
   * @param input Validated request.
   * @param actorId Admin who makes the change.
   * @returns The stock changes (empty when every count already matched).
   * @throws DomainError NOT_FOUND, VALIDATION_FAILED (repeated or untracked variant, negative count or stock), OUT_OF_STOCK.
   */
  async execute(input: AdjustStockInput, actorId: string): Promise<StockChange[]> {
    const variantIds = input.items.map((item) => item.variantId);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new DomainError('VALIDATION_FAILED', 'Each variant can appear only once in one adjustment');
    }
    const [general, inventory] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('inventory'),
    ]);
    const rows = await this.deps.inventory.findVariants(
      variantIds,
      general.defaultLocale,
      inventory.defaultLowStockThreshold,
    );
    const byId = new Map(rows.map((row): [string, InventoryRow] => [row.variantId, row]));
    // One reference for the whole request: the ledger rows of one adjustment can be found together.
    const reference = this.deps.ids.newId();
    const changes: StockDelta[] = [];
    for (const item of input.items) {
      const row = byId.get(item.variantId);
      if (!row) throw new DomainError('NOT_FOUND', 'Variant not found');
      if (!row.tracked) throw new DomainError('VALIDATION_FAILED', 'This variant does not track stock');
      if (item.mode === 'set' && item.value < 0) {
        throw new DomainError('VALIDATION_FAILED', 'A counted stock cannot be negative');
      }
      const delta = item.mode === 'set' ? item.value - row.stock : item.value;
      if (row.stock + delta < 0) throw new DomainError('VALIDATION_FAILED', 'Stock cannot go below zero');
      if (delta !== 0) {
        changes.push({
          variantId: item.variantId,
          delta,
          reason: input.reason,
          reference,
          note: input.note ?? undefined,
        });
      }
    }
    if (changes.length === 0) return [];
    const result = await this.deps.inventory.adjust(changes, {
      actorId,
      nowIso: this.deps.clock.now().toISOString(),
    });
    await this.deps.evaluate.execute(result);
    return result;
  }
}
