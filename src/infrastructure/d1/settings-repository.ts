// Settings persistence. Each group is one JSON row; reads are validated with zod, so a missing or old row gets its defaults
// and invalid stored data falls back to defaults instead of breaking pages. The whole table is read in one query and kept for
// the request (and, in production, briefly across requests), because a page asks for many groups.
import type { SettingsRepository } from '@/application/ports/content';
import {
  SETTINGS_SCHEMAS,
  type SettingsGroup,
  type SettingsMap,
} from '@/application/content/settings-schemas';
import { parseJson, queryAll, statement } from './d1-client';

/** Raw JSON of each stored group. */
type SettingsRows = Map<string, string>;

/** Rows shared by the requests of one isolate, with the time they were read. */
interface SharedSnapshot {
  rows: SettingsRows;
  readAt: number;
}

/** One shared snapshot per database binding, so two stores in one process can never see each other's settings. */
const SHARED = new WeakMap<D1Database, SharedSnapshot>();

/** Options of the settings repository. */
export interface SettingsRepositoryOptions {
  /**
   * How long requests may reuse rows another request read, in milliseconds. 0 turns sharing off: every request reads the table
   * once. An admin change is visible at once in the isolate that saved it and within this time in the others.
   */
  sharedTtlMs: number;
}

/** D1-backed settings repository. */
export class D1SettingsRepository implements SettingsRepository {
  /** Rows read for this request, or being read. Dropped by save(), so a request sees its own writes. */
  private snapshot: Promise<SettingsRows> | null = null;

  /**
   * @param db D1 database binding.
   * @param options Cache lifetime across requests.
   */
  constructor(
    private readonly db: D1Database,
    private readonly options: SettingsRepositoryOptions = { sharedTtlMs: 0 },
  ) {}

  async get<G extends SettingsGroup>(group: G): Promise<SettingsMap[G]> {
    const raw = parseJson<unknown>((await this.rows()).get(group), {});
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
    this.snapshot = null;
    SHARED.delete(this.db);
  }

  /**
   * The stored rows: this request's snapshot, else another request's while it is fresh, else one read of the whole table.
   * @returns Raw JSON per group key.
   */
  private rows(): Promise<SettingsRows> {
    if (this.snapshot) return this.snapshot;
    const shared = SHARED.get(this.db);
    if (shared && Date.now() - shared.readAt < this.options.sharedTtlMs) {
      this.snapshot = Promise.resolve(shared.rows);
      return this.snapshot;
    }
    this.snapshot = this.readAll();
    // A failed read must not stay cached for the rest of the request.
    this.snapshot.catch(() => {
      this.snapshot = null;
    });
    return this.snapshot;
  }

  /**
   * Reads every group in one query and offers the result to other requests.
   * @returns Raw JSON per group key.
   */
  private async readAll(): Promise<SettingsRows> {
    const found = await queryAll<{ group_key: string; value_json: string }>(
      this.db,
      'SELECT group_key, value_json FROM settings',
    );
    const rows: SettingsRows = new Map(found.map((row) => [row.group_key, row.value_json]));
    if (this.options.sharedTtlMs > 0) SHARED.set(this.db, { rows, readAt: Date.now() });
    return rows;
  }
}
