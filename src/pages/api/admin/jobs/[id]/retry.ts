// Owner: runs a failed job again through the queue.
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: async ({ context }) => {
    const admin = requireAdmin(context.locals.admin);
    return context.locals.app.adminOps.retryFailedJob.execute(admin, context.params.id ?? '');
  },
});
