// Settings persistence. Each group is one JSON row; reads are validated with zod, so a missing or old row gets its defaults
// and an invalid stored field falls back to its default instead of breaking pages. The whole table is read in one query and kept for
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

/** How many rounds of dropping invalid fields a read tries before it gives up and uses the group's defaults. */
const MAX_REPAIR_ROUNDS = 5;

/**
 * Parses a stored group. A value that no longer passes the schema (a rule added after it was saved, or a row edited by hand)
 * falls back to its own default only, so one bad field never resets the rest of the group.
 * @param schema Zod schema of the group.
 * @param stored Raw JSON of the stored row.
 * @returns The parsed group.
 */
function readGroup(schema: (typeof SETTINGS_SCHEMAS)[SettingsGroup], stored: unknown): unknown {
  let candidate = stored;
  for (let round = 0; round <= MAX_REPAIR_ROUNDS; round += 1) {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    if (typeof candidate !== 'object' || candidate === null) break;
    const repaired = structuredClone(candidate) as Record<string, unknown>;
    for (const issue of parsed.error.issues) removePath(repaired, issue.path);
    candidate = repaired;
  }
  return schema.parse({});
}

/**
 * Deletes the value an issue points at, so the schema default applies to it.
 * @param root Object to change.
 * @param path Zod issue path.
 */
function removePath(root: Record<string, unknown>, path: PropertyKey[]): void {
  let node: unknown = root;
  for (const key of path.slice(0, -1)) {
    if (typeof node !== 'object' || node === null) return;
    node = (node as Record<PropertyKey, unknown>)[key];
  }
  const last = path[path.length - 1];
  if (last !== undefined && typeof node === 'object' && node !== null) {
    delete (node as Record<PropertyKey, unknown>)[last];
  }
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
    return readGroup(SETTINGS_SCHEMAS[group], raw) as SettingsMap[G];
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
