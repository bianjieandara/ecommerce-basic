// Owner: gives up on a failed job. The job stays in the table, marked as discarded.
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: async ({ context }) => {
    const admin = requireAdmin(context.locals.admin);
    await context.locals.app.adminOps.discardFailedJob.execute(admin, context.params.id ?? '');
    return { discarded: true };
  },
});
