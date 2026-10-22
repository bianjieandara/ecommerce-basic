// Restores the code default of one notification email by removing its saved copy.
import { emailKeyFrom } from '@/application/notifications/email-schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: async ({ context }) => {
    await context.locals.app.emailTemplates.restore(
      requireAdmin(context.locals.admin),
      emailKeyFrom(context.params.key ?? ''),
    );
    return { restored: true };
  },
});
