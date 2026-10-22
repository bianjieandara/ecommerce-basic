// InventoryAlerts: the two alert jobs. Each one reads the stock again when it runs, so a message never describes a state that
// has already changed. The notification log keeps them idempotent: one low-stock email per alert job (a table of every variant
// the operation pushed to its line), and one back-in-stock message per subscriber per restock.
import { chunk } from '@/domain/shared/chunk';
import type { Locale } from '@/domain/shared/locale';
import { PATHS } from '@/domain/shared/paths';
import { absoluteUrl } from '../documents/urls';
import type { StockRow } from '../notifications/context';
import type { NotificationService } from '../notifications/notification-service';
import type { SettingsRepository } from '../ports/content';
import type { InventoryRepository, InventoryRow } from '../ports/inventory';
import type { Clock } from '../ports/platform';

/** Subscribers queued and marked as told together. */
const NOTIFY_GROUP_SIZE = 25;

/** Dependencies of InventoryAlerts. */
export interface InventoryAlertsDeps {
  inventory: InventoryRepository;
  settings: SettingsRepository;
  notifications: NotificationService;
  clock: Clock;
  siteUrl: string;
}

/** Sends the low-stock and back-in-stock messages. */
export class InventoryAlerts {
  /** @param deps Repository, settings, notifications, clock and the site URL. */
  constructor(private readonly deps: InventoryAlertsDeps) {}

  /**
   * One store alert, with a table of the variants one operation pushed to their low-stock line. Variants restocked since are
   * left out, and nothing is sent when none is left or the e-mail channel is off. WhatsApp alerts join in Stage 18.
   * @param variantIds Variants that crossed their line.
   * @param alertId Id of the alert. It forms the notification key, so a retried job sends nothing twice.
   */
  async lowStock(variantIds: string[], alertId: string): Promise<void> {
    const [general, inventory, contact, checkout] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('inventory'),
      this.deps.settings.get('contact'),
      this.deps.settings.get('checkout'),
    ]);
    if (!inventory.lowStockAlerts || !inventory.lowStockAlertChannels.includes('email')) return;
    const rows = (
      await this.deps.inventory.findVariants(
        variantIds,
        general.defaultLocale,
        inventory.defaultLowStockThreshold,
      )
    ).filter((row) => row.productActive && row.tracked && row.stock <= row.threshold);
    if (rows.length === 0) return;
    await this.deps.notifications.notify({
      key: 'low_stock_store',
      reference: alertId,
      recipient: { email: checkout.orderNotificationEmail || contact.email, locale: general.defaultLocale },
      context: { stock: { count: rows.length, items: rows.map(toStockRow) } },
    });
  }

  /**
   * Tells every pending subscriber that a variant has stock again. Nothing is sent when the variant is sold out again by the
   * time the job runs; those subscribers keep waiting for the next restock. Subscribers are marked as told once their
   * messages are queued.
   * @param variantId Variant that has stock again.
   * @param restockedAt When it did. With the variant it forms the notification key, so each restock tells each subscriber once.
   */
  async backInStock(variantId: string, restockedAt: string): Promise<void> {
    const subscribers = await this.deps.inventory.listPendingSubscriptions(variantId);
    if (subscribers.length === 0) return;
    const inventory = await this.deps.settings.get('inventory');
    // Each subscriber gets the product name in their own language, so the variant is read once per language.
    const rows = new Map<Locale, InventoryRow>();
    for (const locale of new Set(subscribers.map((subscriber) => subscriber.locale))) {
      const [row] = await this.deps.inventory.findVariants(
        [variantId],
        locale,
        inventory.defaultLowStockThreshold,
      );
      if (row?.productActive) rows.set(locale, row);
    }
    if (![...rows.values()].some((row) => row.tracked && row.stock > 0)) return;

    // Groups of subscribers are queued together and marked as told as soon as their group is queued, so a failure late in a long
    // list retries only the subscribers not told yet (the notification keys make a repeat harmless either way).
    for (const group of chunk(subscribers, NOTIFY_GROUP_SIZE)) {
      await Promise.all(
        group.map((subscriber) => {
          const row = rows.get(subscriber.locale);
          if (!row) return Promise.resolve();
          return this.deps.notifications.notify({
            key: 'back_in_stock',
            reference: `${variantId}:${restockedAt}`,
            recipient: { email: subscriber.email, locale: subscriber.locale },
            context: {
              product: {
                name: row.productName,
                variant: row.variantLabel,
                url: absoluteUrl(this.deps.siteUrl, PATHS.product(subscriber.locale, row.productSlug)),
              },
            },
          });
        }),
      );
      await this.deps.inventory.markSubscriptionsNotified(
        group.map((subscriber) => subscriber.id),
        this.deps.clock.now().toISOString(),
      );
    }
  }
}

/**
 * Maps a variant to the row the low-stock table shows.
 * @param row Variant as the inventory sees it.
 * @returns The stock row of the alert.
 */
function toStockRow(row: InventoryRow): StockRow {
  return {
    name: row.productName,
    variant: row.variantLabel,
    sku: row.sku ?? '',
    stock: row.stock,
    threshold: row.threshold,
  };
}
