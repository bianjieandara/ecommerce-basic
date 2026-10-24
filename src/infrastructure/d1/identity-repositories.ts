// Identity storage: admin accounts, sessions and password reset tokens. Sessions and reset tokens keep only SHA-256 hashes.
import type { Role } from '@/domain/identity/role';
import type { Locale } from '@/domain/shared/locale';
import type {
  AdminUser,
  AdminUserRepository,
  AdminUserWithHash,
  PasswordResetRepository,
  SessionRepository,
  SessionWithUser,
} from '@/application/ports/identity';
import { boolToInt, queryAll, queryFirst, statement } from './d1-client';

/** Row shape of admin_users. */
interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  locale: Locale;
  phone: string | null;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
}

/**
 * Maps a user row to the application shape (without the hash).
 * @param row Database row.
 * @returns The admin user.
 */
function toUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    locale: row.locale,
    phone: row.phone,
    isActive: row.is_active === 1,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

/** D1-backed admin user repository. */
export class D1AdminUserRepository implements AdminUserRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async findByEmail(email: string): Promise<AdminUserWithHash | null> {
    const row = await queryFirst<AdminUserRow>(this.db, 'SELECT * FROM admin_users WHERE email = ?', [email]);
    return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
  }

  async findById(id: string): Promise<AdminUser | null> {
    const row = await queryFirst<AdminUserRow>(this.db, 'SELECT * FROM admin_users WHERE id = ?', [id]);
    return row ? toUser(row) : null;
  }

  async count(): Promise<number> {
    const row = await queryFirst<{ n: number }>(this.db, 'SELECT COUNT(*) AS n FROM admin_users');
    return row?.n ?? 0;
  }

  async list(): Promise<AdminUser[]> {
    const rows = await queryAll<AdminUserRow>(this.db, 'SELECT * FROM admin_users ORDER BY created_at');
    return rows.map(toUser);
  }

  async create(user: AdminUser & { passwordHash: string }): Promise<void> {
    await statement(
      this.db,
      `INSERT INTO admin_users (id, email, name, password_hash, role, locale, phone, is_active, last_login_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.email,
        user.name,
        user.passwordHash,
        user.role,
        user.locale,
        user.phone,
        boolToInt(user.isActive),
        user.lastLoginAt,
        user.createdAt,
        user.createdAt,
      ],
    ).run();
  }

  async update(user: AdminUser & { passwordHash?: string }): Promise<void> {
    await statement(
      this.db,
      `UPDATE admin_users SET name = ?, role = ?, locale = ?, phone = ?, is_active = ?, last_login_at = ?,
         password_hash = COALESCE(?, password_hash), updated_at = ?
       WHERE id = ?`,
      [
        user.name,
        user.role,
        user.locale,
        user.phone,
        boolToInt(user.isActive),
        user.lastLoginAt,
        user.passwordHash ?? null,
        new Date().toISOString(),
        user.id,
      ],
    ).run();
  }

  async delete(id: string): Promise<void> {
    await statement(this.db, 'DELETE FROM admin_users WHERE id = ?', [id]).run();
  }
}

/** D1-backed session repository. */
export class D1SessionRepository implements SessionRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async create(session: {
    tokenHash: string;
    userId: string;
    expiresAt: string;
    createdAt: string;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void> {
    await statement(
      this.db,
      'INSERT INTO admin_sessions (token_hash, user_id, expires_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      [
        session.tokenHash,
        session.userId,
        session.expiresAt,
        session.createdAt,
        session.ip,
        session.userAgent,
      ],
    ).run();
  }

  async findValid(tokenHash: string, nowIso: string): Promise<SessionWithUser | null> {
    const row = await queryFirst<AdminUserRow & { token_hash: string; expires_at: string }>(
      this.db,
      `SELECT s.token_hash, s.expires_at, u.* FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      [tokenHash, nowIso],
    );
    return row ? { tokenHash: row.token_hash, expiresAt: row.expires_at, user: toUser(row) } : null;
  }

  async delete(tokenHash: string): Promise<void> {
    await statement(this.db, 'DELETE FROM admin_sessions WHERE token_hash = ?', [tokenHash]).run();
  }

  async deleteForUser(userId: string): Promise<void> {
    await statement(this.db, 'DELETE FROM admin_sessions WHERE user_id = ?', [userId]).run();
  }

  async extend(tokenHash: string, expiresAt: string): Promise<void> {
    await statement(this.db, 'UPDATE admin_sessions SET expires_at = ? WHERE token_hash = ?', [
      expiresAt,
      tokenHash,
    ]).run();
  }
}

/** D1-backed password reset repository. */
export class D1PasswordResetRepository implements PasswordResetRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async create(tokenHash: string, userId: string, expiresAt: string): Promise<void> {
    await statement(
      this.db,
      'INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, used_at) VALUES (?, ?, ?, NULL)',
      [tokenHash, userId, expiresAt],
    ).run();
  }

  async findValid(tokenHash: string, nowIso: string): Promise<{ userId: string } | null> {
    const row = await queryFirst<{ user_id: string }>(
      this.db,
      'SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
      [tokenHash, nowIso],
    );
    return row ? { userId: row.user_id } : null;
  }

  async claim(tokenHash: string, nowIso: string): Promise<{ userId: string } | null> {
    // One statement checks and spends the token, so two simultaneous requests cannot both succeed.
    const row = await queryFirst<{ user_id: string }>(
      this.db,
      `UPDATE password_reset_tokens SET used_at = ?
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id`,
      [nowIso, tokenHash, nowIso],
    );
    return row ? { userId: row.user_id } : null;
  }
}
