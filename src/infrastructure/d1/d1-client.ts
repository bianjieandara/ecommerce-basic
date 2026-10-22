// Thin helpers over the D1 binding. Repositories use these instead of raw prepared statements,
// so parameter binding and JSON handling stay in one place.

/** Anything that can be bound to a D1 statement. */
export type SqlValue = string | number | null;

/**
 * Runs a query and returns all rows.
 * @param db D1 database binding.
 * @param sql SQL with ? placeholders.
 * @param params Values to bind in order.
 * @returns Rows typed by the caller.
 */
export async function queryAll<T>(db: D1Database, sql: string, params: SqlValue[] = []): Promise<T[]> {
  const result = await db
    .prepare(sql)
    .bind(...params)
    .all<T>();
  return result.results;
}

/**
 * Runs a query and returns the first row, or null.
 * @param db D1 database binding.
 * @param sql SQL with ? placeholders.
 * @param params Values to bind in order.
 * @returns The first row or null.
 */
export async function queryFirst<T>(db: D1Database, sql: string, params: SqlValue[] = []): Promise<T | null> {
  return db
    .prepare(sql)
    .bind(...params)
    .first<T>();
}

/**
 * Builds a prepared statement for use in a batch.
 * @param db D1 database binding.
 * @param sql SQL with ? placeholders.
 * @param params Values to bind in order.
 * @returns A bound statement.
 */
export function statement(db: D1Database, sql: string, params: SqlValue[] = []): D1PreparedStatement {
  return db.prepare(sql).bind(...params);
}

/**
 * Parses a JSON column, returning a fallback when the stored text is empty or malformed.
 * @param text Stored JSON text.
 * @param fallback Value used when parsing fails.
 * @returns The parsed value.
 */
export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * True when a statement or batch failed on a UNIQUE constraint, for example a slug or SKU that is already used.
 * @param error Error thrown by D1.
 * @returns Whether the error is a uniqueness violation.
 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

/**
 * True when a statement or batch failed on a CHECK constraint, for example stock that would go negative.
 * @param error Error thrown by D1.
 * @returns Whether the error is a check violation.
 */
export function isCheckViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('CHECK constraint failed');
}

/**
 * Converts a boolean to the 0/1 integer stored in D1.
 * @param value Boolean value.
 * @returns 1 or 0.
 */
export function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}
