// Deletes a custom page. The system pages are refused by the use case.
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

/** POST: deletes a custom page; the system pages are refused by the use case. */
export const POST = defineEndpoint({
  method: 'POST',
  invalidatesCache: true,
  handler: async ({ context }) => {
    await context.locals.app.contentAdmin.deletePage.execute(
      requireAdmin(context.locals.admin),
      context.params.id ?? '',
    );
    return { deleted: true };
  },
});
