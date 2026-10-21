// Identity ports: admin users, sessions, password reset tokens and password hashing.
import type { Role } from '@/domain/identity/role';
import type { Locale } from '@/domain/shared/locale';

/** An admin user as the application sees it (no password hash). */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: Locale;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** A user together with the stored password hash, used only by login. */
export interface AdminUserWithHash extends AdminUser {
  passwordHash: string;
}

/** Admin user persistence. */
export interface AdminUserRepository {
  findByEmail(email: string): Promise<AdminUserWithHash | null>;
  findById(id: string): Promise<AdminUser | null>;
  count(): Promise<number>;
  list(): Promise<AdminUser[]>;
  create(user: AdminUser & { passwordHash: string }): Promise<void>;
  update(user: AdminUser & { passwordHash?: string }): Promise<void>;
  delete(id: string): Promise<void>;
}

/** A session with the user it belongs to. */
export interface SessionWithUser {
  tokenHash: string;
  expiresAt: string;
  user: AdminUser;
}

/** Session persistence. Only token hashes are stored. */
export interface SessionRepository {
  create(session: {
    tokenHash: string;
    userId: string;
    expiresAt: string;
    createdAt: string;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void>;
  findValid(tokenHash: string, nowIso: string): Promise<SessionWithUser | null>;
  delete(tokenHash: string): Promise<void>;
  deleteForUser(userId: string): Promise<void>;
  extend(tokenHash: string, expiresAt: string): Promise<void>;
}

/** Password reset token persistence. Tokens are single use and hashed. */
export interface PasswordResetRepository {
  create(tokenHash: string, userId: string, expiresAt: string): Promise<void>;
  findValid(tokenHash: string, nowIso: string): Promise<{ userId: string } | null>;
  markUsed(tokenHash: string, nowIso: string): Promise<void>;
}

/** Password hashing (PBKDF2 via WebCrypto in the adapter). */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, stored: string): Promise<boolean>;
}
