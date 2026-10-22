// Owner or editor: marks a customer message as read.
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: async ({ context }) => {
    const admin = requireAdmin(context.locals.admin);
    await context.locals.app.adminOps.markMessageRead.execute(admin, context.params.id ?? '');
    return { read: true };
  },
});
