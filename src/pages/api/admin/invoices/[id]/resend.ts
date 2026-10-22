// Owner or editor: sends an issued invoice to the customer again.
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: async ({ context }) => {
    const admin = requireAdmin(context.locals.admin);
    await context.locals.app.adminOps.resendInvoice.execute(admin, context.params.id ?? '');
    return { sent: true };
  },
});
