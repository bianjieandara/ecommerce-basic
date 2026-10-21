// Email template overrides. A missing row means the code default is used.
import type { LocalizedText } from '@/domain/shared/localized-text';
import type {
  EmailTemplateOverride,
  EmailTemplateRepository,
  NotificationKey,
} from '@/application/ports/notifications';
import { boolToInt, parseJson, queryAll, queryFirst, statement } from './d1-client';

/** Row shape of email_templates. */
interface EmailTemplateRow {
  key: string;
  subject_json: string;
  body_json: string;
  is_enabled: number;
  updated_at: string;
}

/** Text used when a stored value cannot be read. */
const EMPTY_TEXT: LocalizedText = { es: '', en: '' };

/**
 * Maps a row to the application shape.
 * @param row Database row.
 * @returns Template override.
 */
function toOverride(row: EmailTemplateRow): EmailTemplateOverride {
  return {
    key: row.key as NotificationKey,
    subject: parseJson<LocalizedText>(row.subject_json, EMPTY_TEXT),
    body: parseJson<LocalizedText>(row.body_json, EMPTY_TEXT),
    enabled: row.is_enabled === 1,
    updatedAt: row.updated_at,
  };
}

/** D1-backed email template repository. */
export class D1EmailTemplateRepository implements EmailTemplateRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async find(key: NotificationKey): Promise<EmailTemplateOverride | null> {
    const row = await queryFirst<EmailTemplateRow>(this.db, 'SELECT * FROM email_templates WHERE key = ?', [
      key,
    ]);
    return row ? toOverride(row) : null;
  }

  async list(): Promise<EmailTemplateOverride[]> {
    const rows = await queryAll<EmailTemplateRow>(this.db, 'SELECT * FROM email_templates ORDER BY key');
    return rows.map(toOverride);
  }

  async save(override: EmailTemplateOverride): Promise<void> {
    await statement(
      this.db,
      `INSERT INTO email_templates (key, subject_json, body_json, is_enabled, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET subject_json = excluded.subject_json, body_json = excluded.body_json,
         is_enabled = excluded.is_enabled, updated_at = excluded.updated_at`,
      [
        override.key,
        JSON.stringify(override.subject),
        JSON.stringify(override.body),
        boolToInt(override.enabled),
        override.updatedAt,
      ],
    ).run();
  }

  async delete(key: NotificationKey): Promise<void> {
    await statement(this.db, 'DELETE FROM email_templates WHERE key = ?', [key]).run();
  }
}
