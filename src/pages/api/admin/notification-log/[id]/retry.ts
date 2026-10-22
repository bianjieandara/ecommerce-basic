// Owner: sends a failed message again, by queueing the failed jobs that hold it.
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: async ({ context }) => {
    const admin = requireAdmin(context.locals.admin);
    return context.locals.app.adminOps.retryNotification.execute(admin, context.params.id ?? '');
  },
});
