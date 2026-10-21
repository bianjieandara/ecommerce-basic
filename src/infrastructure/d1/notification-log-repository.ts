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
    const rows = await queryAll<NotificationLogRow>(
      this.db,
      'SELECT * FROM notification_log ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [pageSize, (page - 1) * pageSize],
    );
    const count = await queryFirst<{ n: number }>(this.db, 'SELECT COUNT(*) AS n FROM notification_log');
    return { items: rows.map(toEntry), total: count?.n ?? 0 };
  }
}
