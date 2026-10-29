// Order persistence. Every write that moves money or stock is one D1 batch, so it either happens in full or not at all.
import { DomainError } from '@/domain/shared/errors';
import type { OrderStatus } from '@/domain/ordering/order-status';
import type { Order } from '@/application/dto/order-dto';
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
import { isCheckViolation, queryAll, queryFirst, statement, type SqlValue } from './d1-client';
import { toItem, toOrder, type ItemRow, type OrderRow } from './order-mapper';
import { placeOrderStatements } from './order-statements';
import { addStockChange, stockChangesFrom, type LedgerSlot } from './stock-ledger';

/** D1-backed order repository. */
export class D1OrderRepository implements OrderRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async place(draft: NewOrder): Promise<{ id: string; number: number; stockChanges: StockChange[] }> {
    const { statements, sales } = placeOrderStatements(this.db, draft);

    let stockChanges: StockChange[];
    try {
      stockChanges = stockChangesFrom(await this.db.batch(statements), sales);
    } catch (error) {
      // The CHECK (stock >= 0) constraint rejects a decrement below zero; the whole batch rolls back.
      if (isCheckViolation(error))
        throw new DomainError('OUT_OF_STOCK', 'Not enough stock for some products');
      throw error;
    }
    const row = await queryFirst<{ number: number }>(this.db, 'SELECT number FROM orders WHERE id = ?', [
      draft.id,
    ]);
    if (!row) throw new Error('The order was not stored');
    return { id: draft.id, number: row.number, stockChanges };
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

  async setPaymentReceipt(
    id: string,
    key: string,
    event: NewOrderEvent,
  ): Promise<{ previousKey: string | null } | null> {
    // The batch is one transaction, so the first statement reads the key this update is about to replace: that is the value
    // the write itself saw, not a re-read afterwards, which a second upload could make name the wrong object to delete.
    // All three guard on the order still waiting for payment, so a receipt can never land on an order already settled.
    const results = await this.db.batch([
      statement(
        this.db,
        `SELECT payment_receipt_key AS previous_key FROM orders WHERE id = ? AND status = 'pending_payment'`,
        [id],
      ),
      statement(
        this.db,
        `INSERT INTO order_events (id, order_id, type, note, actor, created_at)
         SELECT ?, id, ?, ?, ?, ? FROM orders WHERE id = ? AND status = 'pending_payment'`,
        [crypto.randomUUID(), event.type, event.note ?? null, event.actor, event.at, id],
      ),
      statement(
        this.db,
        `UPDATE orders SET payment_receipt_key = ?, payment_receipt_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending_payment'`,
        [key, event.at, event.at, id],
      ),
    ]);
    if ((results[2]?.meta.changes ?? 0) === 0) return null;
    const row = ((results[0]?.results ?? []) as { previous_key: string | null }[])[0];
    return { previousKey: row?.previous_key ?? null };
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
    const statements: D1PreparedStatement[] = [
      statement(
        this.db,
        `INSERT INTO order_events (id, order_id, type, note, actor, created_at)
         SELECT ?, id, ?, ?, ?, ? FROM orders WHERE id = ? AND status = ? AND stock_released = 0`,
        [crypto.randomUUID(), event.type, event.note ?? null, event.actor, event.at, id, from],
      ),
    ];
    // The ledger rows go between the event and the status change: each guard must still see the starting status.
    const restores: LedgerSlot[] = [];
    for (const item of items) {
      restores.push(
        addStockChange(this.db, statements, {
          variantId: item.variant_id,
          delta: item.quantity,
          reason: 'cancel_restore',
          reference: id,
          note: event.note ?? null,
          actor: event.actor,
          nowIso: event.at,
          guard,
        }),
      );
    }
    statements.push(
      statement(
        this.db,
        `UPDATE orders SET status = 'cancelled', stock_released = 1, updated_at = ?
         WHERE id = ? AND status = ? AND stock_released = 0`,
        [event.at, id, from],
      ),
    );
    const results = await this.db.batch(statements);
    const cancelled = (results[results.length - 1]?.meta.changes ?? 0) > 0;
    if (!cancelled) return { cancelled, restored: [] };
    return { cancelled, restored: stockChangesFrom(results, restores) };
  }

  async listExpiredPending(nowIso: string, limit: number): Promise<string[]> {
    const rows = await queryAll<{ id: string }>(
      this.db,
      `SELECT id FROM orders WHERE status = 'pending_payment' AND expires_at IS NOT NULL AND expires_at <= ?
       ORDER BY expires_at, id LIMIT ?`,
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
    // The items are chosen by the same condition, so the order and its items come in one round trip.
    const [orders, items] = await this.db.batch([
      statement(this.db, `SELECT * FROM orders WHERE ${where}`, params),
      statement(
        this.db,
        `SELECT * FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE ${where}) ORDER BY rowid`,
        params,
      ),
    ]);
    const row = ((orders?.results ?? []) as OrderRow[])[0];
    if (!row) return null;
    const own = ((items?.results ?? []) as ItemRow[]).filter((item) => item.order_id === row.id);
    return toOrder(row, own.map(toItem));
  }

  async findByIds(ids: string[]): Promise<Order[]> {
    if (ids.length === 0) return [];
    const list = JSON.stringify(ids);
    const [orders, items] = await this.db.batch([
      statement(this.db, 'SELECT * FROM orders WHERE id IN (SELECT value FROM json_each(?))', [list]),
      statement(
        this.db,
        'SELECT * FROM order_items WHERE order_id IN (SELECT value FROM json_each(?)) ORDER BY rowid',
        [list],
      ),
    ]);
    const itemsByOrder = new Map<string, ItemRow[]>();
    for (const item of (items?.results ?? []) as ItemRow[]) {
      itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
    }
    return ((orders?.results ?? []) as OrderRow[]).map((row) =>
      toOrder(row, (itemsByOrder.get(row.id) ?? []).map(toItem)),
    );
  }
}
