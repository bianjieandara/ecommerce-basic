// Changes one admin account: its role and whether it may sign in. Owners only; the use case checks the same permission.
import type { AdminUser } from '@/application/ports/identity';
import { manageUserInput } from '@/application/identity/schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

/** Applies the role change, then the active change, when they are given; answers with the account as it is now. */
export const POST = defineEndpoint({
  method: 'POST',
  input: manageUserInput,
  handler: async ({ input, context }) => {
    const actor = requireAdmin(context.locals.admin);
    const id = context.params.id ?? '';
    const manage = context.locals.app.contentAdmin.manageUsers;
    let user: AdminUser | null = null;
    if (input.role !== undefined) user = await manage.changeRole(actor, id, input.role);
    if (input.isActive !== undefined) user = await manage.setActive(actor, id, input.isActive);
    return { user };
  },
});
