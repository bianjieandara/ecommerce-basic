// Settings persistence. Each group is one JSON row; reads are validated with zod, so a missing or old row
// gets its defaults and invalid stored data falls back to defaults instead of breaking pages.
import type { SettingsRepository } from '@/application/ports/content';
import {
  SETTINGS_SCHEMAS,
  type SettingsGroup,
  type SettingsMap,
} from '@/application/content/settings-schemas';
import { parseJson, queryFirst, statement } from './d1-client';

/** One settings row as stored. */
interface SettingsRow {
  value_json: string;
}

/** D1-backed settings repository. */
export class D1SettingsRepository implements SettingsRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async get<G extends SettingsGroup>(group: G): Promise<SettingsMap[G]> {
    const row = await queryFirst<SettingsRow>(
      this.db,
      'SELECT value_json FROM settings WHERE group_key = ?',
      [group],
    );
    const raw = parseJson<unknown>(row?.value_json, {});
    const parsed = SETTINGS_SCHEMAS[group].safeParse(raw);
    // Invalid stored data falls back to the schema defaults; the admin sees the saved value on the settings page.
    return (parsed.success ? parsed.data : SETTINGS_SCHEMAS[group].parse({})) as SettingsMap[G];
  }

  async save<G extends SettingsGroup>(group: G, value: SettingsMap[G], nowIso: string): Promise<void> {
    const checked = SETTINGS_SCHEMAS[group].parse(value);
    await statement(
      this.db,
      `INSERT INTO settings (group_key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(group_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [group, JSON.stringify(checked), nowIso],
    ).run();
  }
}
