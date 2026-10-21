// Webhook idempotency: each provider event id is stored once, so a retried webhook is recognized and ignored.
import type { PaymentEventLog } from '@/application/ports/payments';
import { statement } from './d1-client';

/** D1-backed payment event log. */
export class D1PaymentEventLog implements PaymentEventLog {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async recordIfNew(provider: string, eventId: string, nowIso: string): Promise<boolean> {
    const result = await statement(
      this.db,
      'INSERT OR IGNORE INTO payment_events (provider, event_id, received_at) VALUES (?, ?, ?)',
      [provider, eventId, nowIso],
    ).run();
    return result.meta.changes > 0;
  }
}
