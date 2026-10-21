// Admin sessions. The browser holds a random token; the database holds only its SHA-256. A session lasts 14 days and is
// extended on use once it has less than 7 days left.
import type { AdminUser, SessionRepository } from '../ports/identity';
import type { Clock, Hasher, IdGenerator } from '../ports/platform';

/** How long a session lasts, in days. */
export const SESSION_DAYS = 14;

/** Sessions with less than this many days left are extended on use. */
const REFRESH_BELOW_DAYS = 7;

const DAY_MS = 86_400_000;

/** Dependencies of SessionService. */
export interface SessionServiceDeps {
  sessions: SessionRepository;
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
}

/** Creates, checks and ends admin sessions. */
export class SessionService {
  /** @param deps Repository, hasher, ids and clock. */
  constructor(private readonly deps: SessionServiceDeps) {}

  /**
   * Starts a session for a user.
   * @param userId Admin user id.
   * @param client Client IP and user agent, stored for the record.
   * @returns The token to put in the browser cookie. It is never stored in plain text.
   */
  async create(userId: string, client: { ip: string | null; userAgent: string | null }): Promise<string> {
    const token = this.deps.ids.newSecret(32);
    const now = this.deps.clock.now();
    await this.deps.sessions.create({
      tokenHash: await this.deps.hasher.sha256Hex(token),
      userId,
      expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString(),
      createdAt: now.toISOString(),
      ip: client.ip,
      userAgent: client.userAgent,
    });
    return token;
  }

  /**
   * Finds the user of a session token, extending the session when it is close to expiry.
   * @param token Token from the cookie.
   * @returns The active user, or null when the session is unknown, expired or the user is inactive.
   */
  async resolve(token: string): Promise<AdminUser | null> {
    const now = this.deps.clock.now();
    const tokenHash = await this.deps.hasher.sha256Hex(token);
    const found = await this.deps.sessions.findValid(tokenHash, now.toISOString());
    if (!found || !found.user.isActive) return null;
    const remainingDays = (Date.parse(found.expiresAt) - now.getTime()) / DAY_MS;
    if (remainingDays < REFRESH_BELOW_DAYS) {
      await this.deps.sessions.extend(
        tokenHash,
        new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString(),
      );
    }
    return found.user;
  }

  /**
   * Ends one session (logout).
   * @param token Token from the cookie.
   */
  async revoke(token: string): Promise<void> {
    await this.deps.sessions.delete(await this.deps.hasher.sha256Hex(token));
  }

  /**
   * Ends every session of a user, for example after a password reset.
   * @param userId Admin user id.
   */
  async revokeAllFor(userId: string): Promise<void> {
    await this.deps.sessions.deleteForUser(userId);
  }
}
