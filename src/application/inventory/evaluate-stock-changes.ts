// EvaluateStockChanges: turns stock changes into alert jobs. Every producer of stock changes (sales, cancellations, manual
// adjustments, imports and product saves) hands its changes here, so the alert rules live in one place.
import { cameBackInStock, crossedLowStock } from '@/domain/inventory/stock';
import type { SettingsRepository } from '../ports/content';
import type { StockChange } from '../ports/inventory';
import type { EnqueueOptions, JobQueue, JobType } from '../ports/jobs';
import type { Clock } from '../ports/platform';

/** Dependencies of EvaluateStockChanges. */
export interface EvaluateStockChangesDeps {
  jobs: JobQueue;
  settings: SettingsRepository;
  clock: Clock;
}

/** Queues the alert jobs that stock changes cause. */
export class EvaluateStockChanges {
  /** @param deps Job queue, settings (default threshold and alert switches) and clock. */
  constructor(private readonly deps: EvaluateStockChangesDeps) {}

  /**
   * Queues one low-stock job per variant that crossed its line, and one back-in-stock job per variant that came back. The jobs
   * send nothing themselves: their handlers read the stock again and then send.
   * @param changes Stock changes of one operation. Empty is fine.
   */
  async execute(changes: StockChange[]): Promise<void> {
    if (changes.length === 0) return;
    const inventory = await this.deps.settings.get('inventory');
    const nowIso = this.deps.clock.now().toISOString();
    // The UTC day keeps "one low-stock alert per variant per day" the same for every admin, whatever their timezone.
    const day = nowIso.slice(0, 10);
    const jobs: { type: JobType; payload: unknown; options: EnqueueOptions }[] = [];
    for (const change of changes) {
      const threshold = change.threshold ?? inventory.defaultLowStockThreshold;
      if (inventory.lowStockAlerts && crossedLowStock(change.before, change.after, threshold)) {
        jobs.push({
          type: 'inventory.low_stock_alert',
          payload: { variantId: change.variantId, day },
          options: { idempotencyKey: `low-stock:${change.variantId}:${day}` },
        });
      }
      if (inventory.backInStockEnabled && cameBackInStock(change.before, change.after)) {
        jobs.push({
          type: 'inventory.back_in_stock',
          payload: { variantId: change.variantId, restockedAt: nowIso },
          options: { idempotencyKey: `back-in-stock:${change.variantId}:${nowIso}` },
        });
      }
    }
    if (jobs.length > 0) await this.deps.jobs.enqueueMany(jobs);
  }
}
