// Wiring of admin identity: accounts, sessions, sign-in, first-owner setup, password reset and invitations. Kept apart from
// the container, like the admin catalog and inventory, so the container stays a list of what exists.
import { InviteAdmin } from '@/application/identity/invite-admin';
import { Login } from '@/application/identity/login';
import { RequestPasswordReset, ResetPassword } from '@/application/identity/password-reset';
import { SessionService } from '@/application/identity/sessions';
import { SetupFirstOwner } from '@/application/identity/setup-first-owner';
import type { NotificationService } from '@/application/notifications/notification-service';
import type { AdminUserRepository } from '@/application/ports/identity';
import type { BotVerifier, Clock, Hasher, IdGenerator, RateLimiter } from '@/application/ports/platform';
import { readSecret } from '@/infrastructure/cloudflare/env';
import {
  D1AdminUserRepository,
  D1PasswordResetRepository,
  D1SessionRepository,
} from '@/infrastructure/d1/identity-repositories';
import { Pbkdf2PasswordHasher } from '@/infrastructure/security/security-adapters';

/** The identity services the container exposes. */
export interface IdentityServices {
  adminUsers: AdminUserRepository;
  sessions: SessionService;
  passwords: Pbkdf2PasswordHasher;
  setupOwner: SetupFirstOwner;
  login: Login;
  requestPasswordReset: RequestPasswordReset;
  resetPassword: ResetPassword;
  inviteAdmin: InviteAdmin;
}

/** Dependencies of the identity wiring. */
export interface IdentityDeps {
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
  notifications: NotificationService;
  botVerifier: BotVerifier;
  rateLimiter: RateLimiter;
  siteUrl: string;
}

/**
 * Builds the identity services from the Worker environment.
 * @param env Worker bindings (DB is used).
 * @param deps Shared services.
 * @returns The wired services.
 */
export function createIdentity(env: Env, deps: IdentityDeps): IdentityServices {
  const { hasher, ids, clock, notifications, botVerifier, rateLimiter, siteUrl } = deps;
  const adminUsers = new D1AdminUserRepository(env.DB);
  const sessions = new SessionService({ sessions: new D1SessionRepository(env.DB), hasher, ids, clock });
  const passwordResets = new D1PasswordResetRepository(env.DB);
  const passwords = new Pbkdf2PasswordHasher();
  return {
    adminUsers,
    sessions,
    passwords,
    setupOwner: new SetupFirstOwner({
      users: adminUsers,
      passwords,
      sessions,
      ids,
      clock,
      setupToken: readSecret('SETUP_TOKEN'),
    }),
    login: new Login({ users: adminUsers, passwords, sessions, botVerifier, rateLimiter, clock }),
    requestPasswordReset: new RequestPasswordReset({
      users: adminUsers,
      resets: passwordResets,
      hasher,
      ids,
      clock,
      notifications,
      botVerifier,
      rateLimiter,
      siteUrl,
    }),
    resetPassword: new ResetPassword({
      users: adminUsers,
      resets: passwordResets,
      passwords,
      hasher,
      sessions,
      clock,
    }),
    inviteAdmin: new InviteAdmin({
      users: adminUsers,
      resets: passwordResets,
      passwords,
      hasher,
      ids,
      clock,
      notifications,
      siteUrl,
    }),
  };
}
