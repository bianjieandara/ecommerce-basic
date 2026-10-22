// Owner-only user management: role changes, deactivation, reactivation and removal of admin accounts. The store always keeps
// one active owner, and nobody changes or ends their own account, so the last way in cannot be locked away by mistake.
import { can, type Role } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser, AdminUserRepository, SessionRepository } from '../ports/identity';
import type { Clock } from '../ports/platform';

/** Dependencies of ManageUsers. */
export interface ManageUsersDeps {
  users: AdminUserRepository;
  sessions: SessionRepository;
  /** Kept for time-stamped changes; the current writes do not need it yet. */
  clock: Clock;
}

/** Changes admin accounts on behalf of a signed-in owner. */
export class ManageUsers {
  /** @param deps Repositories and clock. */
  constructor(private readonly deps: ManageUsersDeps) {}

  /**
   * Gives an account another role.
   * @param actor The signed-in admin.
   * @param id Account to change.
   * @param role New role.
   * @returns The account as it is now.
   * @throws DomainError FORBIDDEN for non-owners, CONFLICT for one's own account, NOT_FOUND, INVALID_STATE for the last owner.
   */
  async changeRole(actor: AdminUser, id: string, role: Role): Promise<AdminUser> {
    this.requireOwner(actor);
    if (id === actor.id) throw new DomainError('CONFLICT', 'You cannot change your own role');
    const target = await this.findTarget(id);
    if (role !== 'owner') await this.assertOwnerRemains(target);
    const updated = { ...target, role };
    await this.deps.users.update(updated);
    return updated;
  }

  /**
   * Turns an account on or off. Deactivating ends its sessions at once; reactivating does not sign anyone in.
   * @param actor The signed-in admin.
   * @param id Account to change.
   * @param isActive True to reactivate, false to deactivate.
   * @returns The account as it is now.
   * @throws DomainError FORBIDDEN for non-owners, CONFLICT when deactivating one's own account, NOT_FOUND, INVALID_STATE for the last owner.
   */
  async setActive(actor: AdminUser, id: string, isActive: boolean): Promise<AdminUser> {
    this.requireOwner(actor);
    if (!isActive && id === actor.id)
      throw new DomainError('CONFLICT', 'You cannot deactivate your own account');
    const target = await this.findTarget(id);
    if (!isActive) {
      await this.assertOwnerRemains(target);
      // Sessions go first: if this fails the account stays active and nothing has been written yet, so the owner can retry.
      await this.deps.sessions.deleteForUser(id);
    }
    const updated = { ...target, isActive };
    await this.deps.users.update(updated);
    return updated;
  }

  /**
   * Deletes an account and its sessions.
   * @param actor The signed-in admin.
   * @param id Account to delete.
   * @throws DomainError FORBIDDEN for non-owners, CONFLICT for one's own account, NOT_FOUND, INVALID_STATE for the last owner.
   */
  async remove(actor: AdminUser, id: string): Promise<void> {
    this.requireOwner(actor);
    if (id === actor.id) throw new DomainError('CONFLICT', 'You cannot delete your own account');
    const target = await this.findTarget(id);
    await this.assertOwnerRemains(target);
    await this.deps.sessions.deleteForUser(id);
    await this.deps.users.delete(id);
  }

  /**
   * Checks the permission every change needs.
   * @param actor The signed-in admin.
   * @throws DomainError FORBIDDEN when the actor may not manage users.
   */
  private requireOwner(actor: AdminUser): void {
    if (!can(actor.role, 'users.manage'))
      throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
  }

  /**
   * Loads the account a change is about.
   * @param id Account id.
   * @returns The account.
   * @throws DomainError NOT_FOUND when there is no such account.
   */
  private async findTarget(id: string): Promise<AdminUser> {
    const target = await this.deps.users.findById(id);
    if (!target) throw new DomainError('NOT_FOUND', 'User not found');
    return target;
  }

  /**
   * Refuses a change that would leave no active owner. Only an active owner can be the last one.
   * The count and the write are two statements; a race between two owners is narrow and the owner list is short.
   * @param target The account before the change.
   * @throws DomainError INVALID_STATE when the account is the only active owner.
   */
  private async assertOwnerRemains(target: AdminUser): Promise<void> {
    if (target.role !== 'owner' || !target.isActive) return;
    const activeOwners = (await this.deps.users.list()).filter(
      (user) => user.role === 'owner' && user.isActive,
    ).length;
    if (activeOwners <= 1)
      throw new DomainError('INVALID_STATE', 'The store needs at least one active owner');
  }
}
