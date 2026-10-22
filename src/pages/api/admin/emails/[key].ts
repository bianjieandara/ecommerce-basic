// Saves one notification email: its copy in both languages and whether it is sent. The use case checks the placeholders and who
// may turn off a store alert.
import { emailKeyFrom, saveEmailInput } from '@/application/notifications/email-schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: saveEmailInput,
  handler: async ({ input, context }) => {
    await context.locals.app.emailTemplates.save(
      requireAdmin(context.locals.admin),
      emailKeyFrom(context.params.key ?? ''),
      input,
    );
    return { saved: true };
  },
});
