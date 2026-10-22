// D1 side of stock changes, unit costs and back-in-stock subscriptions. Stock moves only through adjust(), which writes each
// ledger row in the same batch as its stock update.
import type {
  AdjustContext,
  InventoryRepository,
  InventoryRow,
  NewStockSubscription,
  StockChange,
  StockDelta,
  StockSubscription,
} from '@/application/ports/inventory';
import { DomainError } from '@/domain/shared/errors';
import type { Locale } from '@/domain/shared/locale';
import { boolToInt, isCheckViolation, queryAll, statement } from './d1-client';
import { INVENTORY_ROW_SELECT, rowBinds, toInventoryRow, type InventoryRecord } from './inventory-rows';
import { changesAfter, readStockLevels, stockLedgerStatements } from './stock-ledger';

/** D1-backed stock repository. */
export class D1InventoryRepository implements InventoryRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  /**
   * Applies the changes and their ledger rows in one batch, then reports the stock each change left.
   * @param changes Changes to apply; all of them apply or none does.
   * @param context Who makes the changes, and when.
   * @returns One change per requested change, with before and after values.
   * @throws DomainError OUT_OF_STOCK when a change would take a variant below zero.
   */
  async adjust(changes: StockDelta[], context: AdjustContext): Promise<StockChange[]> {
    if (changes.length === 0) return [];
    const statements = changes.flatMap((change) =>
      stockLedgerStatements(this.db, {
        variantId: change.variantId,
        delta: change.delta,
        reason: change.reason,
        reference: change.reference ?? null,
        note: change.note ?? null,
        actor: context.actorId,
        nowIso: context.nowIso,
      }),
    );
    try {
      await this.db.batch(statements);
    } catch (error) {
      // The CHECK (stock >= 0) constraint refuses the change, and the batch rolls back as a whole.
      if (isCheckViolation(error))
        throw new DomainError('OUT_OF_STOCK', 'Not enough stock for one of the changes');
      throw error;
    }
    const deltas = changes.map((change) => ({ variantId: change.variantId, delta: change.delta }));
    return changesAfter(
      await readStockLevels(
        this.db,
        deltas.map((delta) => delta.variantId),
      ),
      deltas,
    );
  }

  /**
   * Sets unit costs. A cost is not stock, so the ledger is not written.
   * @param updates Cost in minor units per variant.
   */
  async setCosts(updates: { variantId: string; costMinor: number }[]): Promise<void> {
    if (updates.length === 0) return;
    await this.db.batch(
      updates.map((update) =>
        statement(this.db, 'UPDATE product_variants SET cost_minor = ? WHERE id = ?', [
          update.costMinor,
          update.variantId,
        ]),
      ),
    );
  }

  /**
   * Loads variants by id.
   * @param variantIds Variant ids.
   * @param locale Language of the names.
   * @param defaultThreshold Store default low-stock threshold.
   * @returns The rows found.
   */
  async findVariants(
    variantIds: string[],
    locale: Locale,
    defaultThreshold: number,
  ): Promise<InventoryRow[]> {
    if (variantIds.length === 0) return [];
    const rows = await queryAll<InventoryRecord>(
      this.db,
      `${INVENTORY_ROW_SELECT} WHERE v.id IN (SELECT value FROM json_each(?))`,
      [...rowBinds(defaultThreshold, locale), JSON.stringify(variantIds)],
    );
    return rows.map(toInventoryRow);
  }

  /**
   * Loads variants by SKU, exactly.
   * @param skus SKUs as written in the file.
   * @param locale Language of the names.
   * @param defaultThreshold Store default low-stock threshold.
   * @returns The rows found.
   */
  async findVariantsBySku(skus: string[], locale: Locale, defaultThreshold: number): Promise<InventoryRow[]> {
    if (skus.length === 0) return [];
    const rows = await queryAll<InventoryRecord>(
      this.db,
      `${INVENTORY_ROW_SELECT} WHERE v.sku IN (SELECT value FROM json_each(?))`,
      [...rowBinds(defaultThreshold, locale), JSON.stringify(skus)],
    );
    return rows.map(toInventoryRow);
  }

  /**
   * Stores a subscription. A repeat for the same variant and address refreshes it and makes it pending again.
   * @param subscription The subscription.
   */
  async addSubscription(subscription: NewStockSubscription): Promise<void> {
    await statement(
      this.db,
      `INSERT INTO stock_subscriptions (id, variant_id, email, phone, locale, whatsapp_opt_in, created_at, notified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT (variant_id, email) DO UPDATE SET phone = excluded.phone, locale = excluded.locale,
         whatsapp_opt_in = excluded.whatsapp_opt_in, notified_at = NULL`,
      [
        subscription.id,
        subscription.variantId,
        subscription.email,
        subscription.phone,
        subscription.locale,
        boolToInt(subscription.whatsappOptIn),
        subscription.createdAt,
      ],
    ).run();
  }

  /**
   * Subscriptions of a variant that have not been told it is back.
   * @param variantId Variant id.
   * @returns Pending subscriptions, oldest first.
   */
  async listPendingSubscriptions(variantId: string): Promise<StockSubscription[]> {
    const rows = await queryAll<{
      id: string;
      variant_id: string;
      email: string;
      phone: string | null;
      locale: Locale;
      whatsapp_opt_in: number;
    }>(
      this.db,
      `SELECT id, variant_id, email, phone, locale, whatsapp_opt_in FROM stock_subscriptions
       WHERE variant_id = ? AND notified_at IS NULL ORDER BY created_at`,
      [variantId],
    );
    return rows.map((row) => ({
      id: row.id,
      variantId: row.variant_id,
      email: row.email,
      phone: row.phone,
      locale: row.locale,
      whatsappOptIn: row.whatsapp_opt_in === 1,
    }));
  }

  /**
   * Marks subscriptions as told.
   * @param ids Subscription ids.
   * @param nowIso Time they were told.
   */
  async markSubscriptionsNotified(ids: string[], nowIso: string): Promise<void> {
    if (ids.length === 0) return;
    await statement(
      this.db,
      'UPDATE stock_subscriptions SET notified_at = ? WHERE id IN (SELECT value FROM json_each(?))',
      [nowIso, JSON.stringify(ids)],
    ).run();
  }
}
