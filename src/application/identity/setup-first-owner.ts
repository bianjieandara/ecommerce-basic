// SetupFirstOwner: creates the first owner of a new store. It works once, and only with the SETUP_TOKEN secret, so a
// stranger who finds the setup page cannot take over the store.
import { constantTimeEqual } from '@/domain/shared/constant-time';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser, AdminUserRepository, PasswordHasher } from '../ports/identity';
import type { Clock, IdGenerator } from '../ports/platform';
import type { SessionService } from './sessions';
import type { z } from 'zod';
import type { setupOwnerInput } from './schemas';

/** Dependencies of SetupFirstOwner. */
export interface SetupFirstOwnerDeps {
  users: AdminUserRepository;
  passwords: PasswordHasher;
  sessions: SessionService;
  ids: IdGenerator;
  clock: Clock;
  /** The SETUP_TOKEN secret, or null when it is not configured (then setup is impossible). */
  setupToken: string | null;
}

/** Creates the first owner. */
export class SetupFirstOwner {
  /** @param deps Repositories, password hashing, sessions and the setup secret. */
  constructor(private readonly deps: SetupFirstOwnerDeps) {}

  /**
   * Creates the owner and signs them in.
   * @param input Parsed setup form.
   * @param client Client IP and user agent.
   * @returns The session token and the new user.
   * @throws DomainError UNAUTHORIZED for a wrong setup token, CONFLICT when an owner already exists.
   */
  async execute(
    input: z.infer<typeof setupOwnerInput>,
    client: { ip: string | null; userAgent: string | null },
  ): Promise<{ token: string; user: AdminUser }> {
    if (!this.deps.setupToken || !constantTimeEqual(input.setupToken, this.deps.setupToken)) {
      throw new DomainError('UNAUTHORIZED', 'The setup token is not valid');
    }
    if ((await this.deps.users.count()) > 0) {
      throw new DomainError('CONFLICT', 'The store already has an owner');
    }
    const now = this.deps.clock.now().toISOString();
    const user: AdminUser = {
      id: this.deps.ids.newId(),
      email: input.email.toLowerCase(),
      name: input.name,
      role: 'owner',
      locale: input.locale,
      phone: null,
      isActive: true,
      lastLoginAt: now,
      createdAt: now,
    };
    await this.deps.users.create({ ...user, passwordHash: await this.deps.passwords.hash(input.password) });
    const token = await this.deps.sessions.create(user.id, client);
    return { token, user };
  }
}
