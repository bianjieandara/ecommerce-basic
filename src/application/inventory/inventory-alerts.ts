// InventoryAlerts: the two alert jobs. Each one reads the stock again when it runs, so a message never describes a state that
// has already changed. The notification log keeps them idempotent: one low-stock alert per variant per day, and one
// back-in-stock message per subscriber per restock.
import type { Locale } from '@/domain/shared/locale';
import { PATHS } from '@/domain/shared/paths';
import { absoluteUrl } from '../documents/urls';
import type { StockRow } from '../notifications/context';
import type { NotificationService } from '../notifications/notification-service';
import type { SettingsRepository } from '../ports/content';
import type { InventoryRepository, InventoryRow } from '../ports/inventory';
import type { Clock } from '../ports/platform';

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
   * Store alert for a variant that reached its low-stock line. Nothing is sent when the variant has been restocked since, or
   * when the e-mail channel is off. WhatsApp alerts join in Stage 18.
   * @param variantId Variant that crossed its line.
   * @param day UTC day of the crossing. With the variant it forms the notification key.
   */
  async lowStock(variantId: string, day: string): Promise<void> {
    const [general, inventory, contact, checkout] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('inventory'),
      this.deps.settings.get('contact'),
      this.deps.settings.get('checkout'),
    ]);
    if (!inventory.lowStockAlerts || !inventory.lowStockAlertChannels.includes('email')) return;
    const [row] = await this.deps.inventory.findVariants(
      [variantId],
      general.defaultLocale,
      inventory.defaultLowStockThreshold,
    );
    if (!row || !row.tracked || row.stock > row.threshold) return;
    await this.deps.notifications.notify({
      key: 'low_stock_store',
      reference: `${variantId}:${day}`,
      recipient: { email: checkout.orderNotificationEmail || contact.email, locale: general.defaultLocale },
      context: { stock: { count: 1, items: [toStockRow(row)] } },
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
      if (row) rows.set(locale, row);
    }
    if (![...rows.values()].some((row) => row.tracked && row.stock > 0)) return;

    for (const subscriber of subscribers) {
      const row = rows.get(subscriber.locale);
      if (!row) continue;
      await this.deps.notifications.notify({
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
    }
    await this.deps.inventory.markSubscriptionsNotified(
      subscribers.map((subscriber) => subscriber.id),
      this.deps.clock.now().toISOString(),
    );
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
