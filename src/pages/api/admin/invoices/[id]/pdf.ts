// Owner or editor: queues a fresh PDF of an invoice. The stored file is replaced when the job runs.
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: async ({ context }) => {
    const admin = requireAdmin(context.locals.admin);
    await context.locals.app.adminOps.regenerateInvoicePdf.execute(admin, context.params.id ?? '');
    return { queued: true };
  },
});
