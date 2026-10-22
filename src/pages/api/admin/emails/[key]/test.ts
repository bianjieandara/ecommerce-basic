// Sends one notification email to the signed-in admin with sample data, using the saved copy.
import { emailKeyFrom } from '@/application/notifications/email-schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: ({ context }) =>
    context.locals.app.contentAdmin.sendEmailTest.execute(
      requireAdmin(context.locals.admin),
      emailKeyFrom(context.params.key ?? ''),
    ),
});
