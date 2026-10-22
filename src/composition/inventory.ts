// Wiring of the inventory module: stock changes, alerts, the CSV import and back-in-stock subscriptions. Kept apart from the
// container, like the admin catalog, so the container stays a list of what exists rather than how each part is built.
import { AdjustStock } from '@/application/inventory/adjust-stock';
import { EvaluateStockChanges } from '@/application/inventory/evaluate-stock-changes';
import { ImportStock } from '@/application/inventory/import-stock';
import { InventoryAlerts } from '@/application/inventory/inventory-alerts';
import { SubscribeBackInStock } from '@/application/inventory/subscribe-back-in-stock';
import type { NotificationService } from '@/application/notifications/notification-service';
import type { SettingsRepository } from '@/application/ports/content';
import type { InventoryQueries } from '@/application/ports/inventory';
import type { JobQueue } from '@/application/ports/jobs';
import type { BotVerifier, CacheStore, Clock, IdGenerator } from '@/application/ports/platform';
import { logEvent } from '@/infrastructure/system/logger';
import { D1InventoryQueries } from '@/infrastructure/d1/inventory-queries';
import { D1InventoryRepository } from '@/infrastructure/d1/stock-repository';

/** The inventory services the container exposes. */
export interface InventoryServices {
  /** Reads for the screens, the scanner and the ledger. */
  queries: InventoryQueries;
  /** Queues the alerts for a list of stock changes. Every module that changes stock calls it. */
  evaluateStock: EvaluateStockChanges;
  /** Handlers of the two alert jobs. */
  alerts: InventoryAlerts;
  /** Manual stock changes from the admin screens. */
  adjustStock: AdjustStock;
  /** CSV stock imports (preview and apply). */
  importStock: ImportStock;
  /** Storefront "tell me when it is back" requests. */
  subscribeBackInStock: SubscribeBackInStock;
}

/** Dependencies of the inventory wiring. */
export interface InventoryDeps {
  ids: IdGenerator;
  clock: Clock;
  settings: SettingsRepository;
  cache: CacheStore;
  jobs: JobQueue;
  notifications: NotificationService;
  botVerifier: BotVerifier;
  siteUrl: string;
}

/**
 * Builds the inventory services from the Worker environment.
 * @param env Worker bindings (DB is used).
 * @param deps Shared services.
 * @returns The wired services.
 */
export function createInventory(env: Env, deps: InventoryDeps): InventoryServices {
  const stock = new D1InventoryRepository(env.DB);
  const evaluateStock = new EvaluateStockChanges({
    jobs: deps.jobs,
    settings: deps.settings,
    cache: deps.cache,
    ids: deps.ids,
    clock: deps.clock,
    onError: (error) =>
      logEvent('inventory.alerts_failed', { error: error instanceof Error ? error.message : 'unknown' }),
  });
  // The write repository stays in here: pages change stock only through the use cases, which validate and queue the alerts.
  return {
    queries: new D1InventoryQueries(env.DB),
    evaluateStock,
    alerts: new InventoryAlerts({
      inventory: stock,
      settings: deps.settings,
      notifications: deps.notifications,
      clock: deps.clock,
      siteUrl: deps.siteUrl,
    }),
    adjustStock: new AdjustStock({
      inventory: stock,
      settings: deps.settings,
      evaluate: evaluateStock,
      ids: deps.ids,
      clock: deps.clock,
    }),
    importStock: new ImportStock({
      inventory: stock,
      settings: deps.settings,
      evaluate: evaluateStock,
      ids: deps.ids,
      clock: deps.clock,
    }),
    subscribeBackInStock: new SubscribeBackInStock({
      inventory: stock,
      settings: deps.settings,
      botVerifier: deps.botVerifier,
      ids: deps.ids,
      clock: deps.clock,
    }),
  };
}
