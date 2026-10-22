// Order persistence. Every write that moves money or stock is one D1 batch, so it either happens in full or not at all.
import type { CurrencyCode } from '@/domain/shared/currency';
import { DomainError } from '@/domain/shared/errors';
import type { Locale } from '@/domain/shared/locale';
import type { OrderStatus } from '@/domain/ordering/order-status';
import type { Order, OrderItem } from '@/application/dto/order-dto';
import type { StockChange } from '@/application/ports/inventory';
import type {
  CancelResult,
  NewOrder,
  NewOrderEvent,
  OrderEvent,
  OrderPatch,
  OrderRepository,
} from '@/application/ports/ordering';
import type { PaymentMethod } from '@/application/ports/payments';
import { boolToInt, parseJson, queryAll, queryFirst, statement, type SqlValue } from './d1-client';
import { changesAfter, readStockLevels, stockLedgerStatements } from './stock-ledger';

/** Row shape of orders. */
interface OrderRow {
  id: string;
  number: number;
  access_key_hash: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_reference: string | null;
  currency: CurrencyCode;
  locale: Locale;
  prices_include_tax: number;
  subtotal_minor: number;
  tax_minor: number;
  shipping_minor: number;
  total_minor: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  whatsapp_opt_in: number;
  shipping_method_name: string;
  shipping_address_json: string;
  customer_note: string;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Row shape of order_items. */
interface ItemRow {
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_label: string;
  sku: string | null;
  unit_price_minor: number;
  unit_cost_minor: number | null;
  quantity: number;
  line_total_minor: number;
  tax_rate_bp: number;
  tax_minor: number;
  stock_tracked: number;
}

/**
 * Maps an item row to the application shape.
 * @param row Database row.
 * @returns Order item.
 */
function toItem(row: ItemRow): OrderItem {
  return {
    productId: row.product_id,
    variantId: row.variant_id,
    productName: row.product_name,
    variantLabel: row.variant_label,
    sku: row.sku,
    unitPriceMinor: row.unit_price_minor,
    unitCostMinor: row.unit_cost_minor,
    quantity: row.quantity,
    lineTotalMinor: row.line_total_minor,
    taxRateBp: row.tax_rate_bp,
    taxMinor: row.tax_minor,
    stockTracked: row.stock_tracked === 1,
  };
}

/**
 * Maps an order row and its items to the application shape.
 * @param row Database row.
 * @param items Items of the order.
 * @returns Order.
 */
function toOrder(row: OrderRow, items: OrderItem[]): Order {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    currency: row.currency,
    locale: row.locale,
    pricesIncludeTax: row.prices_include_tax === 1,
    subtotalMinor: row.subtotal_minor,
    taxMinor: row.tax_minor,
    shippingMinor: row.shipping_minor,
    totalMinor: row.total_minor,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
      whatsappOptIn: row.whatsapp_opt_in === 1,
    },
    shippingMethodName: row.shipping_method_name,
    shippingAddress: parseJson<Record<string, string>>(row.shipping_address_json, {}),
    note: row.customer_note,
    items,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** D1-backed order repository. */
export class D1OrderRepository implements OrderRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async place(draft: NewOrder): Promise<{ id: string; number: number; stockChanges: StockChange[] }> {
    const statements = [
      statement(this.db, 'UPDATE order_counter SET last_number = last_number + 1 WHERE id = 1'),
      statement(
        this.db,
        `INSERT INTO orders (id, number, access_key_hash, status, payment_method, payment_reference, currency, locale,
           prices_include_tax, subtotal_minor, tax_minor, shipping_minor, total_minor, customer_name, customer_email,
           customer_phone, whatsapp_opt_in, marketing_consent, billing_json, shipping_method_id, shipping_method_name,
           shipping_address_json, customer_note, tracking_code, attribution_json, stock_released, expires_at, paid_at,
           created_at, updated_at)
         VALUES (?, (SELECT last_number FROM order_counter WHERE id = 1), ?, 'pending_payment', ?, NULL, ?, ?, ?, ?, ?,
           ?, ?, ?, ?, ?, ?, 0, '{}', ?, ?, ?, ?, NULL, ?, 0, ?, NULL, ?, ?)`,
        [
          draft.id,
          draft.accessKeyHash,
          draft.paymentMethod,
          draft.currency,
          draft.locale,
          boolToInt(draft.pricesIncludeTax),
          draft.subtotalMinor,
          draft.taxMinor,
          draft.shippingMinor,
          draft.totalMinor,
          draft.customer.name,
          draft.customer.email,
          draft.customer.phone,
          boolToInt(draft.customer.whatsappOptIn),
          draft.shippingMethodId,
          draft.shippingMethodName,
          JSON.stringify(draft.shippingAddress),
          draft.note,
          JSON.stringify(draft.attribution),
          draft.expiresAt,
          draft.createdAt,
          draft.createdAt,
        ],
      ),
    ];
    for (const [index, item] of draft.items.entries()) {
      statements.push(
        statement(
          this.db,
          `INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, variant_label, sku, image_media_id,
             unit_price_minor, unit_cost_minor, quantity, line_total_minor, tax_rate_bp, tax_minor, stock_tracked)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `${draft.id}:${index}`,
            draft.id,
            item.productId,
            item.variantId,
            item.productName,
            item.variantLabel,
            item.sku,
            item.unitPriceMinor,
            item.unitCostMinor,
            item.quantity,
            item.lineTotalMinor,
            item.taxRateBp,
            item.taxMinor,
            boolToInt(item.stockTracked),
          ],
        ),
      );
      if (item.stockTracked) {
        statements.push(
          ...stockLedgerStatements(this.db, {
            variantId: item.variantId,
            delta: -item.quantity,
            reason: 'sale',
            reference: draft.id,
            note: null,
            actor: 'customer',
            nowIso: draft.createdAt,
          }),
        );
      }
    }
    statements.push(
      statement(
        this.db,
        `INSERT INTO order_events (id, order_id, type, note, actor, created_at) VALUES (?, ?, 'placed', NULL, 'customer', ?)`,
        [crypto.randomUUID(), draft.id, draft.createdAt],
      ),
    );

    try {
      await this.db.batch(statements);
    } catch (error) {
      // The CHECK (stock >= 0) constraint rejects a decrement below zero; the whole batch rolls back.
      if (error instanceof Error && /CHECK constraint failed/i.test(error.message)) {
        throw new DomainError('OUT_OF_STOCK', 'Not enough stock for some products');
      }
      throw error;
    }
    const row = await queryFirst<{ number: number }>(this.db, 'SELECT number FROM orders WHERE id = ?', [
      draft.id,
    ]);
    if (!row) throw new Error('The order was not stored');
    const sales = draft.items
      .filter((item) => item.stockTracked)
      .map((item) => ({ variantId: item.variantId, delta: -item.quantity }));
    const levels = await readStockLevels(
      this.db,
      sales.map((sale) => sale.variantId),
    );
    return { id: draft.id, number: row.number, stockChanges: changesAfter(levels, sales) };
  }

  async findById(id: string): Promise<Order | null> {
    return this.load('id = ?', [id]);
  }

  async findByNumber(number: number): Promise<Order | null> {
    return this.load('number = ?', [number]);
  }

  async findAccessKeyHash(number: number): Promise<{ id: string; accessKeyHash: string } | null> {
    const row = await queryFirst<{ id: string; access_key_hash: string }>(
      this.db,
      'SELECT id, access_key_hash FROM orders WHERE number = ?',
      [number],
    );
    return row ? { id: row.id, accessKeyHash: row.access_key_hash } : null;
  }

  async findByPaymentReference(method: PaymentMethod, reference: string): Promise<Order | null> {
    return this.load('payment_method = ? AND payment_reference = ?', [method, reference]);
  }

  async setPaymentReference(id: string, reference: string, nowIso: string): Promise<void> {
    await statement(this.db, 'UPDATE orders SET payment_reference = ?, updated_at = ? WHERE id = ?', [
      reference,
      nowIso,
      id,
    ]).run();
  }

  async transition(
    id: string,
    from: OrderStatus,
    to: OrderStatus,
    event: NewOrderEvent,
    patch: OrderPatch = {},
  ): Promise<boolean> {
    // The event is written first, only while the order is still in `from`; the status update then guards the same.
    const results = await this.db.batch([
      statement(
        this.db,
        `INSERT INTO order_events (id, order_id, type, note, actor, created_at)
         SELECT ?, id, ?, ?, ?, ? FROM orders WHERE id = ? AND status = ?`,
        [crypto.randomUUID(), event.type, event.note ?? null, event.actor, event.at, id, from],
      ),
      statement(
        this.db,
        `UPDATE orders SET status = ?, paid_at = COALESCE(?, paid_at),
           payment_reference = COALESCE(?, payment_reference), tracking_code = COALESCE(?, tracking_code), updated_at = ?
         WHERE id = ? AND status = ?`,
        [
          to,
          patch.paidAt ?? null,
          patch.paymentReference ?? null,
          patch.trackingCode ?? null,
          event.at,
          id,
          from,
        ],
      ),
    ]);
    return (results[1]?.meta.changes ?? 0) > 0;
  }

  async cancelAndReleaseStock(id: string, from: OrderStatus, event: NewOrderEvent): Promise<CancelResult> {
    const items = await queryAll<{ variant_id: string; quantity: number }>(
      this.db,
      'SELECT variant_id, quantity FROM order_items WHERE order_id = ? AND stock_tracked = 1',
      [id],
    );
    // Every statement below checks the order's state first. The order is flipped to cancelled last, so each check
    // still sees the state the cancellation started from.
    const guard = {
      sql: 'EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = ? AND stock_released = 0)',
      params: [id, from] as SqlValue[],
    };
    const statements = [
      statement(
        this.db,
        `INSERT INTO order_events (id, order_id, type, note, actor, created_at)
         SELECT ?, id, ?, ?, ?, ? FROM orders WHERE id = ? AND status = ? AND stock_released = 0`,
        [crypto.randomUUID(), event.type, event.note ?? null, event.actor, event.at, id, from],
      ),
      ...items.flatMap((item) =>
        stockLedgerStatements(this.db, {
          variantId: item.variant_id,
          delta: item.quantity,
          reason: 'cancel_restore',
          reference: id,
          note: event.note ?? null,
          actor: event.actor,
          nowIso: event.at,
          guard,
        }),
      ),
      statement(
        this.db,
        `UPDATE orders SET status = 'cancelled', stock_released = 1, updated_at = ?
         WHERE id = ? AND status = ? AND stock_released = 0`,
        [event.at, id, from],
      ),
    ];
    const results = await this.db.batch(statements);
    const cancelled = (results[results.length - 1]?.meta.changes ?? 0) > 0;
    if (!cancelled) return { cancelled, restored: [] };
    const restores = items.map((item) => ({ variantId: item.variant_id, delta: item.quantity }));
    const levels = await readStockLevels(
      this.db,
      restores.map((restore) => restore.variantId),
    );
    return { cancelled, restored: changesAfter(levels, restores) };
  }

  async listExpiredPending(nowIso: string, limit: number): Promise<string[]> {
    const rows = await queryAll<{ id: string }>(
      this.db,
      `SELECT id FROM orders WHERE status = 'pending_payment' AND expires_at IS NOT NULL AND expires_at <= ?
       ORDER BY expires_at LIMIT ?`,
      [nowIso, limit],
    );
    return rows.map((row) => row.id);
  }

  async listEvents(orderId: string): Promise<OrderEvent[]> {
    const rows = await queryAll<{ type: string; note: string | null; actor: string; created_at: string }>(
      this.db,
      'SELECT type, note, actor, created_at FROM order_events WHERE order_id = ? ORDER BY created_at, rowid',
      [orderId],
    );
    return rows.map((row) => ({
      type: row.type,
      note: row.note,
      actor: row.actor,
      createdAt: row.created_at,
    }));
  }

  /**
   * Loads one order with its items.
   * @param where SQL condition on the orders table, with ? placeholders.
   * @param params Values for the placeholders.
   * @returns The order, or null when none matches.
   */
  private async load(where: string, params: SqlValue[]): Promise<Order | null> {
    const row = await queryFirst<OrderRow>(this.db, `SELECT * FROM orders WHERE ${where}`, params);
    if (!row) return null;
    const items = await queryAll<ItemRow>(
      this.db,
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid',
      [row.id],
    );
    return toOrder(row, items.map(toItem));
  }
}
