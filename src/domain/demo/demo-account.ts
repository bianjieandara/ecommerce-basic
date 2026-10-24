// The shared login of the public demo store. Anyone who reads the login page can sign in with it, so the actions that could take
// the store over (users, passwords, refunds) refuse it. Everything else stays open, because the nightly reset undoes it.
import { DomainError } from '../shared/errors';

/** Id of the demo account. demo/snapshot.json names it, and the nightly reset writes the account under this id. */
export const DEMO_ACCOUNT_ID = 'demo-account';

/**
 * Whether a user is the shared demo account.
 * @param user Any admin user, or the actor of a request.
 * @returns True for the demo account.
 */
export function isDemoAccount(user: { id: string }): boolean {
  return user.id === DEMO_ACCOUNT_ID;
}

/**
 * Refuses an action on the demo account (as the actor, or as the target of the change).
 * @param user Admin user the action runs as, or the account it changes.
 * @throws DomainError DEMO_LOCKED when the user is the demo account.
 */
export function assertNotDemoAccount(user: { id: string }): void {
  if (isDemoAccount(user)) throw new DomainError('DEMO_LOCKED', 'This action is locked in the demo store.');
}
