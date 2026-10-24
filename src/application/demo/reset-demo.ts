// ResetDemo: puts the demo store back to its snapshot and clears what visitors did. It runs every night (the scheduler enqueues
// it) and on demand from an owner. It removes the visitors' images and e-mails, restores the snapshot's tables with times moved
// forward, and writes the shared demo account with a fresh password hash. Owners' accounts are never touched.
import type { AdminUser, PasswordHasher } from '../ports/identity';
import type { CacheStore, Clock, PageCacheVersion } from '../ports/platform';
import type { MediaStorage } from '../ports/media';
import type { DemoRepository, DemoRow } from '../ports/demo';
import { DEMO_ACCOUNT_ID } from '@/domain/demo/demo-account';
import { RESTORE_TABLES } from '@/domain/demo/restore-tables';
import { shiftDay, shiftInstants } from '@/domain/demo/shift-time';
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import { outboxKey } from '../notifications/outbox';
import { demoSnapshotSchema, type DemoSnapshot } from './snapshot-schema';

/** Where the published snapshot lives in the store's object storage. */
export const DEMO_SNAPSHOT_KEY = 'demo/snapshot.json';

/** Cache key of the last successful reset: which snapshot version it restored, and when. */
const LAST_RESET_KEY = 'demo:last-reset';

/** How long the record of the last reset is kept (for the admin to see it). */
const LAST_RESET_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Dependencies of ResetDemo. */
export interface ResetDemoDeps {
  /** False outside demo mode: the reset then refuses to run. */
  enabled: boolean;
  media: MediaStorage;
  repository: DemoRepository;
  cache: CacheStore;
  pageCache: PageCacheVersion;
  passwords: PasswordHasher;
  clock: Clock;
  /** Login of the shared account, from the client's configuration. */
  account: { email: string; password: string; name: string };
}

/** What one reset did. */
export interface ResetDemoOutcome {
  status: 'restored' | 'no-snapshot';
  version?: string;
  /** Batches of the database restore that failed; the rest of the reset still ran. */
  failedBatches?: number;
  removedImages?: number;
  removedEmails?: number;
}

/** Restores the demo store from its snapshot. */
export class ResetDemo {
  /** @param deps Storage, database, cache, hashing and configuration. */
  constructor(private readonly deps: ResetDemoDeps) {}

  /**
   * Runs one reset.
   * @param actor The owner who asked for it, or null for the scheduled reset.
   * @returns What was done; `no-snapshot` when nothing has been published yet.
   * @throws DomainError INVALID_STATE outside demo mode, FORBIDDEN for a user who may not change settings, VALIDATION_FAILED
   *   when the published snapshot does not match the format.
   */
  async execute(actor: AdminUser | null): Promise<ResetDemoOutcome> {
    if (!this.deps.enabled) throw new DomainError('INVALID_STATE', 'Demo mode is off for this store.');
    if (!this.deps.account.email || !this.deps.account.password) {
      throw new DomainError(
        'INVALID_STATE',
        'The demo login is not set (DEMO_LOGIN_EMAIL and DEMO_LOGIN_PASSWORD).',
      );
    }
    if (actor && !can(actor.role, 'settings.manage')) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
    }
    const raw = await this.deps.media.getBytes(DEMO_SNAPSHOT_KEY);
    if (!raw) return { status: 'no-snapshot' };
    const snapshot = parseSnapshot(raw);

    const now = this.deps.clock.now();
    const deltaMs = now.getTime() - Date.parse(snapshot.takenAt);
    const visitors = await this.deps.repository.visitorState();

    // Images that visitors uploaded are not in the snapshot; the e-mails in the outbox were never sent.
    const kept = new Set(snapshot.media);
    const visitorImages = visitors.mediaKeys.filter((key) => !kept.has(key));
    await this.deps.media.delete(visitorImages);
    await this.deps.media.delete(visitors.outboxIds.map(outboxKey));

    const tables = RESTORE_TABLES.flatMap((table) => {
      const rows = snapshot.tables[table];
      if (!rows) return [];
      return [[table, rows.map((row) => moveTimes(table, row, deltaMs))] as [string, DemoRow[]]];
    });
    const passwordHash = await this.deps.passwords.hash(this.deps.account.password);
    const { failedBatches } = await this.deps.repository.restore({
      tables,
      account: {
        id: DEMO_ACCOUNT_ID,
        email: this.deps.account.email.toLowerCase(),
        name: this.deps.account.name,
        passwordHash,
        locale: 'en',
        createdAt: now.toISOString(),
      },
    });

    await this.deps.cache.putJson(
      LAST_RESET_KEY,
      { version: snapshot.version, at: now.toISOString(), failedBatches },
      LAST_RESET_TTL_SECONDS,
    );
    await this.deps.pageCache.bump();
    return {
      status: 'restored',
      version: snapshot.version,
      failedBatches,
      removedImages: visitorImages.length,
      removedEmails: visitors.outboxIds.length,
    };
  }
}

/**
 * Parses the published snapshot, refusing anything that does not match the format.
 * @param raw Bytes of demo/snapshot.json.
 * @returns The parsed snapshot.
 * @throws DomainError VALIDATION_FAILED when the file is not a snapshot of this format.
 */
function parseSnapshot(raw: ArrayBuffer): DemoSnapshot {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new DomainError('VALIDATION_FAILED', 'The demo snapshot is not JSON');
  }
  const parsed = demoSnapshotSchema.safeParse(json);
  if (!parsed.success)
    throw new DomainError('VALIDATION_FAILED', 'The demo snapshot does not match its format');
  return parsed.data;
}

/**
 * Moves one row's times forward. The daily metrics are keyed by a day, so their key moves by whole days.
 * @param table Table the row belongs to.
 * @param row The row as written in the snapshot.
 * @param deltaMs Milliseconds since the snapshot was taken.
 * @returns The row to restore.
 */
function moveTimes(table: string, row: DemoRow, deltaMs: number): DemoRow {
  const moved = shiftInstants(row, deltaMs);
  if (table === 'daily_metrics' && typeof row.day === 'string') moved.day = shiftDay(row.day, deltaMs);
  return moved;
}
