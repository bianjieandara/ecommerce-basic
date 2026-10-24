// Login: checks the bot challenge and the attempt limit, then the password, and opens a session. Every failure gives the
// same answer, so the form never reveals whether an email has an account.
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser, AdminUserRepository, PasswordHasher } from '../ports/identity';
import type { BotVerifier, Clock, RateLimiter } from '../ports/platform';
import type { SessionService } from './sessions';

/**
 * Hash of a random password nobody knows, in the stored format with the same iteration count as real hashes. An unknown or
 * inactive email is checked against it, so the answer takes as long as a real account's and timing cannot reveal which emails exist.
 */
const UNKNOWN_ACCOUNT_HASH =
  'pbkdf2_sha256$100000$A-Mzn_GHJgBMNHEtis2zMg$MjZUJUfEYTa4YkCf-4PCenWoe5e5HvBzZt0bOZYE864';

/** Dependencies of Login. */
export interface LoginDeps {
  users: AdminUserRepository;
  passwords: PasswordHasher;
  sessions: SessionService;
  botVerifier: BotVerifier;
  rateLimiter: RateLimiter;
  clock: Clock;
}

/** Signs admin users in. */
export class Login {
  /** @param deps Repositories, password checks, sessions, bot check and attempt limit. */
  constructor(private readonly deps: LoginDeps) {}

  /**
   * Checks the credentials and opens a session.
   * @param input Email, password and Turnstile token.
   * @param client Client IP and user agent.
   * @returns The session token and the user.
   * @throws DomainError BOT_CHECK_FAILED, RATE_LIMITED, or UNAUTHORIZED for any wrong credential.
   */
  async execute(
    input: { email: string; password: string; turnstileToken: string | null },
    client: { ip: string | null; userAgent: string | null },
  ): Promise<{ token: string; user: AdminUser }> {
    if (!(await this.deps.botVerifier.verify(input.turnstileToken, client.ip))) {
      throw new DomainError('BOT_CHECK_FAILED', 'The security check failed');
    }
    const email = input.email.toLowerCase();
    // Every attempt counts, successful or not, so guessing is limited per client and per email.
    if (!(await this.deps.rateLimiter.allow('auth', `${client.ip ?? 'unknown'}:${email}`))) {
      throw new DomainError('RATE_LIMITED', 'Too many attempts. Please wait a moment.');
    }
    const found = await this.deps.users.findByEmail(email);
    // The password is always checked, against a dummy hash when there is no account, so every failure costs the same time.
    const passwordOk = await this.deps.passwords.verify(
      input.password,
      found ? found.passwordHash : UNKNOWN_ACCOUNT_HASH,
    );
    if (!found || !found.isActive || !passwordOk) {
      throw new DomainError('UNAUTHORIZED', 'Invalid email or password');
    }
    const now = this.deps.clock.now().toISOString();
    // Built field by field, so the password hash never leaves this use case.
    const user: AdminUser = {
      id: found.id,
      email: found.email,
      name: found.name,
      role: found.role,
      locale: found.locale,
      phone: found.phone,
      isActive: found.isActive,
      lastLoginAt: now,
      createdAt: found.createdAt,
    };
    await this.deps.users.update(user);
    const token = await this.deps.sessions.create(user.id, client);
    return { token, user };
  }
}
