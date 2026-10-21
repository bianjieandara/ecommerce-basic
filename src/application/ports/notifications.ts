// Notification ports. Templates (code defaults plus admin overrides) and the log of every message sent.
import type { LocalizedText } from '@/domain/shared/localized-text';

/** Every message the system can send. Each key has an email template and optionally a WhatsApp template. */
export type NotificationKey =
  | 'order_received'
  | 'order_alert_store'
  | 'payment_confirmed'
  | 'order_processing'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'order_refunded'
  | 'invoice_issued'
  | 'contact_message_store'
  | 'contact_autoreply'
  | 'low_stock_store'
  | 'back_in_stock'
  | 'weekly_report_store'
  | 'admin_password_reset'
  | 'admin_invite';

/** Admin override of an email template. Missing rows fall back to the code default. */
export interface EmailTemplateOverride {
  key: NotificationKey;
  subject: LocalizedText;
  body: LocalizedText;
  enabled: boolean;
  updatedAt: string;
}

/** Persistence for email template overrides. */
export interface EmailTemplateRepository {
  find(key: NotificationKey): Promise<EmailTemplateOverride | null>;
  list(): Promise<EmailTemplateOverride[]>;
  save(override: EmailTemplateOverride): Promise<void>;
  delete(key: NotificationKey): Promise<void>;
}

/** A row in the notification log. */
export interface NotificationLogEntry {
  id: string;
  channel: 'email' | 'whatsapp';
  templateKey: NotificationKey;
  recipient: string;
  subject: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';
  providerMessageId: string | null;
  error: string | null;
  orderId: string | null;
  createdAt: string;
}

/** Persistence for the notification log. The idempotency key makes duplicate queuing a no-op. */
export interface NotificationLogRepository {
  createQueued(
    entry: Omit<NotificationLogEntry, 'id' | 'status' | 'providerMessageId' | 'error' | 'subject'> & {
      subject: string | null;
      idempotencyKey: string;
      id: string;
    },
  ): Promise<{ inserted: boolean }>;
  markSent(idempotencyKey: string, providerMessageId: string, nowIso: string): Promise<void>;
  markFailed(idempotencyKey: string, error: string, nowIso: string): Promise<void>;
  markSkipped(idempotencyKey: string, reason: string, nowIso: string): Promise<void>;
  updateByProviderId(
    providerMessageId: string,
    status: 'delivered' | 'read' | 'failed',
    error: string | null,
    nowIso: string,
  ): Promise<void>;
  list(page: number, pageSize: number): Promise<{ items: NotificationLogEntry[]; total: number }>;
}
