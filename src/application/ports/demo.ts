// Demo store ports: what the nightly reset reads and writes in the database. The implementation is in infrastructure/d1.

/** One row of a snapshot table: column name to value. */
export type DemoRow = Record<string, unknown>;

/** The shared demo account, written by every reset with a fresh password hash. */
export interface DemoAccountRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  locale: string;
  createdAt: string;
}

/** Everything one reset writes: the snapshot's tables (times already moved) and the demo account. */
export interface DemoRestorePlan {
  /** Tables in restore order, parents first. */
  tables: [table: string, rows: DemoRow[]][];
  account: DemoAccountRecord;
}

/** What visitors left behind that the reset has to clean up outside the database. */
export interface DemoVisitorState {
  /** R2 keys of images that some media asset uses. */
  mediaKeys: string[];
  /** Provider message ids of the e-mails in the log (their bodies are in the outbox). */
  outboxIds: string[];
}

/** The database side of a reset. */
export interface DemoRepository {
  visitorState(): Promise<DemoVisitorState>;
  /**
   * Empties the snapshot tables and the logs, then writes the plan. Runs in batches, each atomic; a batch that fails is counted
   * and the rest still run, so the result says how much was written.
   */
  restore(plan: DemoRestorePlan): Promise<{ failedBatches: number }>;
}
