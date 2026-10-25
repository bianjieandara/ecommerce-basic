// SetupFirstOwner: creates the first owner of a new store. It works once, and only with the SETUP_TOKEN secret, so a
// stranger who finds the setup page cannot take over the store.
import { constantTimeEqual } from '@/domain/shared/constant-time';
import { DomainError } from '@/domain/shared/errors';
import { STARTER_PAYMENT_METHODS, STARTER_SHIPPING_METHODS } from '../content/defaults/starter-content';
import { checkoutSettings } from '../content/settings-schemas';
import type { SettingsRepository } from '../ports/content';
import type { AdminUser, AdminUserRepository, PasswordHasher } from '../ports/identity';
import type { ShippingMethodRepository } from '../ports/ordering';
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
  /** Gets the starter shipping methods, so checkout works on a new store. */
  shipping: ShippingMethodRepository;
  /** Turns on the starter payment method. */
  settings: SettingsRepository;
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
    // The owner is committed, so a failed seed must not fail setup: the owner can add these in the admin.
    try {
      await this.deps.shipping.seedIfEmpty(STARTER_SHIPPING_METHODS);
    } catch (error) {
      console.error('setup.starter_shipping_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    // Only a checkout that still has the schema defaults is replaced: a store that was configured before setup keeps its methods.
    try {
      const defaults = JSON.stringify(checkoutSettings.parse({}));
      if (JSON.stringify(await this.deps.settings.get('checkout')) === defaults) {
        await this.deps.settings.save(
          'checkout',
          checkoutSettings.parse({ enabledMethods: [...STARTER_PAYMENT_METHODS] }),
          now,
        );
      }
    } catch (error) {
      console.error('setup.starter_checkout_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return { token, user };
  }
}
