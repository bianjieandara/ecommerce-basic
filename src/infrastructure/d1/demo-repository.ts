// Demo reset in D1: empties the snapshot tables and the logs, writes the snapshot back and the shared demo account. The statements
// go out in batches of at most BATCH_SIZE; each batch is one transaction. A batch that fails is counted and the rest still run.
import type { DemoRepository, DemoRestorePlan, DemoRow, DemoVisitorState } from '@/application/ports/demo';
import { DEMO_ACCOUNT_ID } from '@/domain/demo/demo-account';
import { RESTORE_TABLES, VISITOR_TABLES } from '@/domain/demo/restore-tables';
import { chunk } from '@/domain/shared/chunk';
import { queryAll, statement, type SqlValue } from './d1-client';

/** Statements per D1 batch. Each statement is one row, so a batch stays well under D1's parameter limits. */
const BATCH_SIZE = 100;

/** Tables that hold the demo account's own sessions and reset tokens. */
const ACCOUNT_TABLES = ['admin_sessions', 'password_reset_tokens'] as const;

/** Turns a snapshot value into something D1 can bind. */
function bindable(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return JSON.stringify(value);
}

/**
 * One INSERT for one row.
 * @param db D1 database binding.
 * @param table Table name (checked against RESTORE_TABLES before this runs).
 * @param row The row; its keys are the columns (checked against the snapshot format before this runs).
 * @returns The prepared statement.
 */
function insertRow(db: D1Database, table: string, row: DemoRow) {
  const columns = Object.keys(row);
  return statement(
    db,
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => bindable(row[column])),
  );
}

/** D1-backed demo reset. */
export class D1DemoRepository implements DemoRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async visitorState(): Promise<DemoVisitorState> {
    const [assets, emails] = await Promise.all([
      queryAll<{ variants_json: string }>(this.db, 'SELECT variants_json FROM media_assets'),
      queryAll<{ id: string }>(
        this.db,
        "SELECT provider_message_id AS id FROM notification_log WHERE channel = 'email' AND provider_message_id IS NOT NULL",
      ),
    ]);
    const mediaKeys = assets.flatMap((asset) =>
      (JSON.parse(asset.variants_json) as { key: string }[]).map((variant) => variant.key),
    );
    return { mediaKeys, outboxIds: emails.map((row) => row.id) };
  }

  async restore(plan: DemoRestorePlan): Promise<{ failedBatches: number }> {
    const db = this.db;
    const statements = [
      // Visitors' rows first: they refer to orders and to each other.
      ...VISITOR_TABLES.map((table) => statement(db, `DELETE FROM ${table}`)),
      statement(db, 'DELETE FROM product_search'),
      // Parents are emptied after their children, so the foreign keys always hold.
      ...[...RESTORE_TABLES].reverse().map((table) => statement(db, `DELETE FROM ${table}`)),
      ...ACCOUNT_TABLES.map((table) =>
        statement(db, `DELETE FROM ${table} WHERE user_id = ?`, [DEMO_ACCOUNT_ID]),
      ),
      this.upsertAccount(plan),
      ...plan.tables.flatMap(([table, rows]) => rows.map((row) => insertRow(db, table, row))),
      // The search index is derived from the translations; rebuilding it here keeps the snapshot free of index rows.
      statement(
        db,
        'INSERT INTO product_search (product_id, locale, name, short_description) SELECT product_id, locale, name, short_description FROM product_translations',
      ),
    ];

    let failedBatches = 0;
    for (const group of chunk(statements, BATCH_SIZE)) {
      try {
        await db.batch(group);
      } catch (error) {
        failedBatches += 1;
        console.error('demo.restore_batch_failed', {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { failedBatches };
  }

  /**
   * Writes the demo account: created on the first reset, updated (password, name, role) on the later ones.
   * @param plan The restore plan, which carries the account.
   * @returns The statement.
   */
  private upsertAccount(plan: DemoRestorePlan) {
    const account = plan.account;
    return statement(
      this.db,
      `INSERT INTO admin_users (id, email, name, password_hash, role, locale, phone, is_active, last_login_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'owner', ?, NULL, 1, NULL, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, password_hash = excluded.password_hash,
         role = 'owner', is_active = 1, updated_at = excluded.updated_at`,
      [
        account.id,
        account.email,
        account.name,
        account.passwordHash,
        account.locale,
        account.createdAt,
        account.createdAt,
      ],
    );
  }
}
