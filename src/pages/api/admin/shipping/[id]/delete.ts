// Deletes one shipping method. The use case refuses an unknown id.
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  invalidatesCache: true,
  handler: async ({ context }) => {
    await context.locals.app.contentAdmin.manageShipping.remove(
      requireAdmin(context.locals.admin),
      context.params.id ?? '',
    );
    return { deleted: true };
  },
});
