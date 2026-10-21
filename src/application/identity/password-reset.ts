// Password reset: a single-use token, valid for 30 minutes, is emailed to the admin. Only its SHA-256 is stored. A request
// never reveals whether the email has an account.
import { DomainError } from '@/domain/shared/errors';
import { ADMIN_PATHS } from '@/domain/shared/paths';
import { absoluteUrl } from '../documents/urls';
import type { NotificationService } from '../notifications/notification-service';
import type { AdminUserRepository, PasswordHasher, PasswordResetRepository } from '../ports/identity';
import type { BotVerifier, Clock, Hasher, IdGenerator, RateLimiter } from '../ports/platform';
import type { SessionService } from './sessions';

/** How long a reset link stays valid, in minutes. */
export const RESET_MINUTES = 30;

const MINUTE_MS = 60_000;

/** Dependencies of RequestPasswordReset. */
export interface RequestPasswordResetDeps {
  users: AdminUserRepository;
  resets: PasswordResetRepository;
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
  notifications: NotificationService;
  botVerifier: BotVerifier;
  rateLimiter: RateLimiter;
  siteUrl: string;
}

/** Emails a reset link to an admin. */
export class RequestPasswordReset {
  /** @param deps Repositories, the token helpers, notifications and the bot and rate checks. */
  constructor(private readonly deps: RequestPasswordResetDeps) {}

  /**
   * Emails a reset link when the email belongs to an active admin. Any other email gets the same silence.
   * @param input Email and Turnstile token.
   * @param client Client IP, used for the bot check and the rate limit.
   * @throws DomainError BOT_CHECK_FAILED or RATE_LIMITED.
   */
  async execute(
    input: { email: string; turnstileToken: string | null },
    client: { ip: string | null },
  ): Promise<void> {
    if (!(await this.deps.botVerifier.verify(input.turnstileToken, client.ip))) {
      throw new DomainError('BOT_CHECK_FAILED', 'The security check failed');
    }
    if (!(await this.deps.rateLimiter.allow('auth', `reset:${client.ip ?? 'unknown'}`))) {
      throw new DomainError('RATE_LIMITED', 'Too many attempts. Please wait a moment.');
    }
    const user = await this.deps.users.findByEmail(input.email.toLowerCase());
    if (!user || !user.isActive) return;

    const token = this.deps.ids.newSecret(32);
    const now = this.deps.clock.now();
    const tokenHash = await this.deps.hasher.sha256Hex(token);
    await this.deps.resets.create(
      tokenHash,
      user.id,
      new Date(now.getTime() + RESET_MINUTES * MINUTE_MS).toISOString(),
    );
    await this.deps.notifications.notify({
      key: 'admin_password_reset',
      reference: tokenHash,
      recipient: { email: user.email, locale: user.locale },
      context: {
        admin: {
          name: user.name,
          inviterName: '',
          resetUrl: `${absoluteUrl(this.deps.siteUrl, ADMIN_PATHS.resetPassword)}?token=${token}`,
          inviteUrl: '',
        },
      },
    });
  }
}

/** Dependencies of ResetPassword. */
export interface ResetPasswordDeps {
  users: AdminUserRepository;
  resets: PasswordResetRepository;
  passwords: PasswordHasher;
  hasher: Hasher;
  sessions: SessionService;
  clock: Clock;
}

/** Sets a new password with a reset or invitation token. */
export class ResetPassword {
  /** @param deps Repositories, password hashing and sessions. */
  constructor(private readonly deps: ResetPasswordDeps) {}

  /**
   * Sets the password and ends every session of the user, so an attacker who had one is signed out.
   * @param input Token from the link and the new password.
   * @throws DomainError INVALID_STATE when the link is unknown, used or expired.
   */
  async execute(input: { token: string; password: string }): Promise<void> {
    const now = this.deps.clock.now();
    const tokenHash = await this.deps.hasher.sha256Hex(input.token);
    const found = await this.deps.resets.findValid(tokenHash, now.toISOString());
    if (!found) throw new DomainError('INVALID_STATE', 'This link is not valid or has expired');
    const user = await this.deps.users.findById(found.userId);
    if (!user || !user.isActive)
      throw new DomainError('INVALID_STATE', 'This link is not valid or has expired');

    await this.deps.users.update({
      ...user,
      passwordHash: await this.deps.passwords.hash(input.password),
    });
    await this.deps.resets.markUsed(tokenHash, now.toISOString());
    await this.deps.sessions.revokeAllFor(user.id);
  }
}
