// WhatsApp persistence: the template configs (whatsapp_templates) and the delivery statuses written into notification_log.
// Statuses only move a message forward, so a late or repeated webhook can never undo a read or a delivery.
import type { LocalizedText } from '@/domain/shared/localized-text';
import type { WhatsAppStatusRepository, WhatsAppStatusUpdate } from '@/application/ports/whatsapp';
import {
  type WhatsAppKey,
  type WhatsAppRemoteStatus,
  type WhatsAppTemplateConfig,
  type WhatsAppTemplateRepository,
} from '@/application/ports/whatsapp';
import { chunk } from '@/domain/shared/chunk';
import { parseJson, queryAll, queryFirst, statement } from './d1-client';

/** Statements per D1 batch; webhook deliveries are small, but the adapter keeps any size inside D1's limits. */
const BATCH_SIZE = 50;

/** Columns of whatsapp_templates, in the order the mapper reads them. */
const COLUMNS =
  'key, meta_name, is_enabled, body_json, params_json, button_param_path, header_document, remote_status_json, updated_at';

/** Row shape of whatsapp_templates. */
interface TemplateRow {
  key: string;
  meta_name: string;
  is_enabled: number;
  body_json: string;
  params_json: string;
  button_param_path: string | null;
  header_document: number;
  remote_status_json: string;
  updated_at: string;
}

/** Text used when a stored body cannot be read. */
const EMPTY_TEXT: LocalizedText = { es: '', en: '' };

/**
 * Maps a row to the application shape.
 * @param row Database row.
 * @returns The stored config.
 */
function toConfig(row: TemplateRow): WhatsAppTemplateConfig {
  return {
    key: row.key as WhatsAppKey,
    metaName: row.meta_name,
    enabled: row.is_enabled === 1,
    body: parseJson<LocalizedText>(row.body_json, EMPTY_TEXT),
    params: parseJson<string[]>(row.params_json, []),
    buttonPath: row.button_param_path,
    headerDocument: row.header_document === 1,
    remoteStatus: parseJson<WhatsAppRemoteStatus>(row.remote_status_json, {}),
    updatedAt: row.updated_at,
  };
}

/** D1-backed WhatsApp template configs. */
export class D1WhatsAppTemplateRepository implements WhatsAppTemplateRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async find(key: WhatsAppKey): Promise<WhatsAppTemplateConfig | null> {
    const row = await queryFirst<TemplateRow>(
      this.db,
      `SELECT ${COLUMNS} FROM whatsapp_templates WHERE key = ?`,
      [key],
    );
    return row ? toConfig(row) : null;
  }

  async list(): Promise<WhatsAppTemplateConfig[]> {
    const rows = await queryAll<TemplateRow>(
      this.db,
      `SELECT ${COLUMNS} FROM whatsapp_templates ORDER BY key`,
    );
    return rows.map(toConfig);
  }

  /**
   * Inserts the defaults in one statement, leaving existing rows alone. The defaults travel as one JSON parameter, so the
   * number of keys does not change the number of statements.
   * @param defaults Configs to insert when their key has no row.
   */
  async seedMissing(defaults: WhatsAppTemplateConfig[]): Promise<void> {
    if (defaults.length === 0) return;
    const rows = defaults.map((config) => ({
      key: config.key,
      metaName: config.metaName,
      body: config.body,
      params: config.params,
      buttonPath: config.buttonPath,
      headerDocument: config.headerDocument,
      updatedAt: config.updatedAt,
    }));
    await statement(
      this.db,
      `INSERT OR IGNORE INTO whatsapp_templates (${COLUMNS})
       SELECT json_extract(value, '$.key'), json_extract(value, '$.metaName'), 0, json_extract(value, '$.body'),
              json_extract(value, '$.params'), json_extract(value, '$.buttonPath'), json_extract(value, '$.headerDocument'),
              '{}', json_extract(value, '$.updatedAt')
       FROM json_each(?)`,
      [JSON.stringify(rows)],
    ).run();
  }

  /**
   * Writes the config and returns the row as stored, in the same statement.
   * @param config Config to store.
   * @returns The stored row.
   * @throws Error when the statement returns no row, which cannot happen for an upsert.
   */
  async save(config: WhatsAppTemplateConfig): Promise<WhatsAppTemplateConfig> {
    const row = await queryFirst<TemplateRow>(
      this.db,
      `INSERT INTO whatsapp_templates (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET meta_name = excluded.meta_name, is_enabled = excluded.is_enabled,
         body_json = excluded.body_json, params_json = excluded.params_json,
         button_param_path = excluded.button_param_path, header_document = excluded.header_document,
         remote_status_json = excluded.remote_status_json, updated_at = excluded.updated_at
       RETURNING ${COLUMNS}`,
      [
        config.key,
        config.metaName,
        config.enabled ? 1 : 0,
        JSON.stringify(config.body),
        JSON.stringify(config.params),
        config.buttonPath,
        config.headerDocument ? 1 : 0,
        JSON.stringify(config.remoteStatus),
        config.updatedAt,
      ],
    );
    if (!row) throw new Error('whatsapp_templates upsert returned no row');
    return toConfig(row);
  }

  /**
   * Stores the per-language status and returns the stored value.
   * @param key Message key.
   * @param remoteStatus Statuses to store. The row's own timestamp is not changed: a sync is not an edit of the template.
   */
  async saveRemoteStatus(
    key: WhatsAppKey,
    remoteStatus: WhatsAppRemoteStatus,
  ): Promise<WhatsAppRemoteStatus> {
    const row = await queryFirst<{ remote_status_json: string }>(
      this.db,
      'UPDATE whatsapp_templates SET remote_status_json = ? WHERE key = ? RETURNING remote_status_json',
      [JSON.stringify(remoteStatus), key],
    );
    return row ? parseJson<WhatsAppRemoteStatus>(row.remote_status_json, {}) : remoteStatus;
  }
}

/** Status-to-SQL: a row only moves forward, so a late "sent" or "delivered" never reverts a read or a failure. */
const STATUS_SQL = {
  delivered: {
    sql: "UPDATE notification_log SET status = 'delivered', error = NULL, updated_at = ? WHERE provider_message_id = ? AND status IN ('queued', 'sent')",
    bind: (update: WhatsAppStatusUpdate, nowIso: string) => [nowIso, update.providerMessageId],
  },
  read: {
    sql: "UPDATE notification_log SET status = 'read', error = NULL, updated_at = ? WHERE provider_message_id = ? AND status IN ('queued', 'sent', 'delivered')",
    bind: (update: WhatsAppStatusUpdate, nowIso: string) => [nowIso, update.providerMessageId],
  },
  failed: {
    sql: "UPDATE notification_log SET status = 'failed', error = ?, updated_at = ? WHERE provider_message_id = ? AND status IN ('queued', 'sent')",
    bind: (update: WhatsAppStatusUpdate, nowIso: string) => [
      update.error?.slice(0, 500) ?? null,
      nowIso,
      update.providerMessageId,
    ],
  },
} as const;

/** D1-backed delivery status updates for the notification log. */
export class D1WhatsAppStatusRepository implements WhatsAppStatusRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async applyStatuses(updates: WhatsAppStatusUpdate[], nowIso: string): Promise<number> {
    let changed = 0;
    for (const group of chunk(updates, BATCH_SIZE)) {
      const statements = group.map((update) => {
        const entry = STATUS_SQL[update.status];
        return statement(this.db, entry.sql, entry.bind(update, nowIso));
      });
      const results = await this.db.batch(statements);
      changed += results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
    }
    return changed;
  }
}
