// InviteAdmin: adds an admin account and emails an invitation link. The invitee sets their own password through that link,
// so the owner never handles a password. Only owners may invite.
import { can, type Role } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { Locale } from '@/domain/shared/locale';
import { ADMIN_PATHS } from '@/domain/shared/paths';
import { absoluteUrl } from '../documents/urls';
import type { NotificationService } from '../notifications/notification-service';
import type {
  AdminUser,
  AdminUserRepository,
  PasswordHasher,
  PasswordResetRepository,
} from '../ports/identity';
import type { Clock, Hasher, IdGenerator } from '../ports/platform';

/** How long an invitation link stays valid, in days. */
export const INVITE_DAYS = 7;

const DAY_MS = 86_400_000;

/** Dependencies of InviteAdmin. */
export interface InviteAdminDeps {
  users: AdminUserRepository;
  resets: PasswordResetRepository;
  passwords: PasswordHasher;
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
  notifications: NotificationService;
  siteUrl: string;
}

/** Invites another admin. */
export class InviteAdmin {
  /** @param deps Repositories, token helpers and notifications. */
  constructor(private readonly deps: InviteAdminDeps) {}

  /**
   * Creates the account (with an unusable password) and emails the invitation link.
   * @param actor The signed-in admin who invites.
   * @param input Email, name, role and language of the invitee.
   * @returns The new user.
   * @throws DomainError FORBIDDEN for non-owners, CONFLICT when the email is already used.
   */
  async execute(
    actor: AdminUser,
    input: { email: string; name: string; role: Role; locale: Locale },
  ): Promise<AdminUser> {
    if (!can(actor.role, 'users.manage')) {
      throw new DomainError('FORBIDDEN', 'Only owners can invite admins');
    }
    const email = input.email.toLowerCase();
    if (await this.deps.users.findByEmail(email)) {
      throw new DomainError('CONFLICT', 'That email already has an account');
    }
    const now = this.deps.clock.now();
    const user: AdminUser = {
      id: this.deps.ids.newId(),
      email,
      name: input.name,
      role: input.role,
      locale: input.locale,
      phone: null,
      isActive: true,
      lastLoginAt: null,
      createdAt: now.toISOString(),
    };
    // The placeholder password is random and never shown, so nobody can sign in until the invitation sets one.
    await this.deps.users.create({
      ...user,
      passwordHash: await this.deps.passwords.hash(this.deps.ids.newSecret(32)),
    });

    const token = this.deps.ids.newSecret(32);
    const tokenHash = await this.deps.hasher.sha256Hex(token);
    await this.deps.resets.create(
      tokenHash,
      user.id,
      new Date(now.getTime() + INVITE_DAYS * DAY_MS).toISOString(),
    );
    await this.deps.notifications.notify({
      key: 'admin_invite',
      reference: tokenHash,
      recipient: { email, locale: input.locale },
      context: {
        admin: {
          name: input.name,
          inviterName: actor.name,
          resetUrl: '',
          inviteUrl: `${absoluteUrl(this.deps.siteUrl, ADMIN_PATHS.acceptInvite)}?token=${token}`,
        },
      },
    });
    return user;
  }
}
