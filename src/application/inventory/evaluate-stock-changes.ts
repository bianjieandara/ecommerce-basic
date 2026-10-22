// EvaluateStockChanges: turns stock changes into alert jobs. Every producer of stock changes (sales, cancellations, manual
// adjustments, imports and product saves) hands its changes here, so the alert rules live in one place.
import { cameBackInStock, crossedLowStock } from '@/domain/inventory/stock';
import type { SettingsRepository } from '../ports/content';
import type { StockChange } from '../ports/inventory';
import type { EnqueueOptions, JobQueue, JobType } from '../ports/jobs';
import type { CacheStore, Clock, IdGenerator } from '../ports/platform';

/** How long a "alerted today" marker lives. Two days, so it outlasts the day it marks whatever the clock skew. */
const LOW_STOCK_MARKER_TTL_SECONDS = 2 * 24 * 60 * 60;

/** Dependencies of EvaluateStockChanges. */
export interface EvaluateStockChangesDeps {
  jobs: JobQueue;
  settings: SettingsRepository;
  cache: CacheStore;
  ids: IdGenerator;
  clock: Clock;
  /** Called when queuing the alerts fails. Alerts are best effort, so the failure is reported, never thrown. */
  onError: (error: unknown) => void;
}

/** Queues the alert jobs that stock changes cause. */
export class EvaluateStockChanges {
  /** @param deps Job queue, settings (default threshold and alert switches), ids and clock. */
  constructor(private readonly deps: EvaluateStockChangesDeps) {}

  /**
   * Queues one low-stock job for all the variants of the operation that crossed their line, and one back-in-stock job per
   * variant that came back. The jobs send nothing themselves: their handlers read the stock again and then send. Never
   * throws: by the time it runs the stock change is committed, so a failure here must not fail the sale, cancellation or
   * adjustment that caused it.
   * @param changes Stock changes of one operation. Empty is fine.
   */
  async execute(changes: StockChange[]): Promise<void> {
    if (changes.length === 0) return;
    try {
      await this.queueAlerts(changes);
    } catch (error) {
      this.deps.onError(error);
    }
  }

  /**
   * Builds and queues the alert jobs.
   * @param changes Non-empty stock changes.
   */
  private async queueAlerts(changes: StockChange[]): Promise<void> {
    const inventory = await this.deps.settings.get('inventory');
    const nowIso = this.deps.clock.now().toISOString();
    const jobs: { type: JobType; payload: unknown; options: EnqueueOptions }[] = [];

    const crossed = inventory.lowStockAlerts
      ? changes.filter((change) =>
          crossedLowStock(
            change.before,
            change.after,
            change.threshold ?? inventory.defaultLowStockThreshold,
          ),
        )
      : [];
    const alerting = await this.notYetAlertedToday(
      crossed.map((change) => change.variantId),
      nowIso,
    );
    if (alerting.length > 0) {
      const alertId = this.deps.ids.newId();
      jobs.push({
        type: 'inventory.low_stock_alert',
        payload: { alertId, variantIds: alerting },
        options: { idempotencyKey: `low-stock:${alertId}` },
      });
    }
    if (inventory.backInStockEnabled) {
      for (const change of changes.filter((item) => cameBackInStock(item.before, item.after))) {
        jobs.push({
          type: 'inventory.back_in_stock',
          payload: { variantId: change.variantId, restockedAt: nowIso },
          options: { idempotencyKey: `back-in-stock:${change.variantId}:${nowIso}` },
        });
      }
    }
    if (jobs.length > 0) await this.deps.jobs.enqueueMany(jobs);
    // Marked only now that the alert is queued: if queuing had failed, the variants must still be able to alert later today.
    await this.markAlertedToday(alerting, nowIso);
  }

  /**
   * Keeps one low-stock alert per variant per day, as the plan requires: a variant that dips, is restocked and dips again the
   * same day does not alert twice. The day is the UTC day, so it is the same for every admin whatever their timezone.
   * @param variantIds Variants that crossed their line in this operation.
   * @param nowIso Time of the operation.
   * @returns The variants that have not alerted yet today.
   */
  private async notYetAlertedToday(variantIds: string[], nowIso: string): Promise<string[]> {
    const unique = [...new Set(variantIds)];
    const marked = await Promise.all(
      unique.map((variantId) => this.deps.cache.getJson<true>(lowStockMarkerKey(variantId, nowIso))),
    );
    return unique.filter((_, index) => !marked[index]);
  }

  /**
   * Remembers that these variants alerted today.
   * @param variantIds Variants whose alert is queued.
   * @param nowIso Time of the operation.
   */
  private async markAlertedToday(variantIds: string[], nowIso: string): Promise<void> {
    await Promise.all(
      variantIds.map((variantId) =>
        this.deps.cache.putJson(lowStockMarkerKey(variantId, nowIso), true, LOW_STOCK_MARKER_TTL_SECONDS),
      ),
    );
  }
}

/**
 * KV key that marks a variant as alerted on the UTC day of an instant.
 * @param variantId Variant id.
 * @param nowIso Instant, as an ISO string.
 * @returns The key.
 */
function lowStockMarkerKey(variantId: string, nowIso: string): string {
  return `inventory:low-stock:${variantId}:${nowIso.slice(0, 10)}`;
}
