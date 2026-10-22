// Deletes one admin account. Owners only; the use case refuses one's own account and the last active owner.
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

/** Deletes the account named in the path. */
export const POST = defineEndpoint({
  method: 'POST',
  handler: async ({ context }) => {
    await context.locals.app.contentAdmin.manageUsers.remove(
      requireAdmin(context.locals.admin),
      context.params.id ?? '',
    );
    return { deleted: true };
  },
});
