// Password reset request. It gets the same answer whether or not the email has an account, so the form cannot be used to
// find out which emails are registered. The link is emailed only when there is an account.
import { forgotPasswordInput } from '@/application/identity/schemas';
import { clientOf } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: forgotPasswordInput,
  handler: async ({ input, context }) => {
    await context.locals.app.requestPasswordReset.execute(input, clientOf(context.request));
    return { sent: true };
  },
});
