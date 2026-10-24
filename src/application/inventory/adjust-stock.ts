// AdjustStock: manual stock changes from the inventory screens. Each change writes a ledger row with its reason, its note and
// the admin who made it. The alerts are evaluated once the batch has applied.
import type { AdminUser } from '../ports/identity';
import { assertCan } from '@/domain/identity/role';
import { planStockChange } from '@/domain/inventory/stock';
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
   * @param actor The signed-in admin who makes the change; needs the inventory permission.
   * @param input Validated request.
   * @returns The stock changes (empty when every count already matched).
   * @throws DomainError FORBIDDEN, NOT_FOUND, VALIDATION_FAILED (a repeated variant, or a StockProblem in `details.reason`), OUT_OF_STOCK.
   */
  async execute(actor: AdminUser, input: AdjustStockInput): Promise<StockChange[]> {
    assertCan(actor.role, 'inventory.adjust');
    const actorId = actor.id;
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
      const plan = planStockChange({
        tracked: row.tracked,
        stock: row.stock,
        mode: item.mode === 'set' ? 'set' : 'add',
        quantity: item.value,
        expected: item.expected,
      });
      // The reason is a code the screen translates; the message is for logs.
      if ('problem' in plan) {
        throw new DomainError('VALIDATION_FAILED', `Stock change refused: ${plan.problem}`, {
          reason: plan.problem,
          variantId: item.variantId,
        });
      }
      if (plan.delta !== 0) {
        changes.push({
          variantId: item.variantId,
          delta: plan.delta,
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
