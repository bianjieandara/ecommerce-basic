// Notification log: one row per message. The idempotency key is unique, so queuing the same message twice does nothing.
import type {
  NotificationKey,
  NotificationLogEntry,
  NotificationLogRepository,
} from '@/application/ports/notifications';
import { queryAll, queryFirst, statement } from './d1-client';

/** Row shape of notification_log. */
interface NotificationLogRow {
  id: string;
  channel: 'email' | 'whatsapp';
  template_key: string;
  recipient: string;
  subject: string | null;
  status: NotificationLogEntry['status'];
  provider_message_id: string | null;
  error: string | null;
  order_id: string | null;
  idempotency_key: string;
  created_at: string;
}

/**
 * Maps a row to the application shape.
 * @param row Database row.
 * @returns Log entry.
 */
function toEntry(row: NotificationLogRow): NotificationLogEntry {
  return {
    id: row.id,
    channel: row.channel,
    templateKey: row.template_key as NotificationKey,
    recipient: row.recipient,
    subject: row.subject,
    status: row.status,
    providerMessageId: row.provider_message_id,
    error: row.error,
    orderId: row.order_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

/** D1-backed notification log. */
export class D1NotificationLogRepository implements NotificationLogRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async createQueued(
    entry: Parameters<NotificationLogRepository['createQueued']>[0],
  ): Promise<{ inserted: boolean }> {
    const result = await statement(
      this.db,
      `INSERT INTO notification_log (id, channel, template_key, recipient, subject, status, order_id, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)
       ON CONFLICT(idempotency_key) DO NOTHING`,
      [
        entry.id,
        entry.channel,
        entry.templateKey,
        entry.recipient,
        entry.subject,
        entry.orderId,
        entry.idempotencyKey,
        entry.createdAt,
        entry.createdAt,
      ],
    ).run();
    return { inserted: result.meta.changes > 0 };
  }

  async markSent(
    idempotencyKey: string,
    providerMessageId: string,
    subject: string,
    nowIso: string,
  ): Promise<void> {
    await statement(
      this.db,
      `UPDATE notification_log SET status = 'sent', provider_message_id = ?, subject = ?, error = NULL, updated_at = ?
       WHERE idempotency_key = ?`,
      [providerMessageId, subject, nowIso, idempotencyKey],
    ).run();
  }

  async markFailed(idempotencyKey: string, error: string, nowIso: string): Promise<void> {
    await statement(
      this.db,
      `UPDATE notification_log SET status = 'failed', error = ?, updated_at = ? WHERE idempotency_key = ?`,
      [error.slice(0, 2000), nowIso, idempotencyKey],
    ).run();
  }

  async markSkipped(idempotencyKey: string, reason: string, nowIso: string): Promise<void> {
    await statement(
      this.db,
      `UPDATE notification_log SET status = 'skipped', error = ?, updated_at = ? WHERE idempotency_key = ?`,
      [reason, nowIso, idempotencyKey],
    ).run();
  }

  async updateByProviderId(
    providerMessageId: string,
    status: 'delivered' | 'read' | 'failed',
    error: string | null,
    nowIso: string,
  ): Promise<void> {
    await statement(
      this.db,
      `UPDATE notification_log SET status = ?, error = ?, updated_at = ? WHERE provider_message_id = ?`,
      [status, error, nowIso, providerMessageId],
    ).run();
  }

  async list(page: number, pageSize: number): Promise<{ items: NotificationLogEntry[]; total: number }> {
    // The page and the count are independent, so one batch answers both.
    const results = await this.db.batch([
      statement(
        this.db,
        'SELECT * FROM notification_log ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
        [pageSize, (page - 1) * pageSize],
      ),
      statement(this.db, 'SELECT COUNT(*) AS n FROM notification_log'),
    ]);
    const rows = (results[0]?.results ?? []) as NotificationLogRow[];
    const total = ((results[1]?.results ?? []) as { n: number }[])[0]?.n ?? 0;
    return { items: rows.map(toEntry), total };
  }

  async get(id: string): Promise<NotificationLogEntry | null> {
    const row = await queryFirst<NotificationLogRow>(this.db, 'SELECT * FROM notification_log WHERE id = ?', [
      id,
    ]);
    return row ? toEntry(row) : null;
  }

  async listForOrder(orderId: string, limit: number): Promise<NotificationLogEntry[]> {
    const rows = await queryAll<NotificationLogRow>(
      this.db,
      'SELECT * FROM notification_log WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
      [orderId, limit],
    );
    return rows.map(toEntry);
  }
}
