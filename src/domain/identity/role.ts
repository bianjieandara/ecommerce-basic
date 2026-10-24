// Admin roles and the permission map. Permissions are checked by use cases, not by the UI, so hiding a button is never the only guard.

/** Admin roles, the one closed set. Owners can do everything; editors manage the day-to-day store. */
export const ROLES = ['owner', 'editor'] as const;

/** An admin role. Forms and zod schemas derive from ROLES. */
export type Role = (typeof ROLES)[number];

/** Named permissions used by use cases and endpoints. */
export type Permission =
  | 'catalog.edit'
  | 'orders.manage'
  | 'orders.refund'
  | 'inventory.adjust'
  | 'content.edit'
  | 'emails.edit'
  | 'emails.disable_store_alerts'
  | 'invoices.void'
  | 'settings.manage'
  | 'users.manage'
  | 'jobs.manage';

/** What each role may do. Owners have every permission. */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    'catalog.edit',
    'orders.manage',
    'orders.refund',
    'inventory.adjust',
    'content.edit',
    'emails.edit',
    'emails.disable_store_alerts',
    'invoices.void',
    'settings.manage',
    'users.manage',
    'jobs.manage',
  ],
  editor: ['catalog.edit', 'orders.manage', 'inventory.adjust', 'content.edit', 'emails.edit'],
};

/**
 * Checks whether a role holds a permission.
 * @param role Admin role.
 * @param permission Permission to check.
 * @returns True when the role may perform the action.
 */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
