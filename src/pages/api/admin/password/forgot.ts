// Password reset request. It gets the same answer whether or not the email has an account, so the form cannot be used to
// find out which emails are registered. The link is emailed only when there is an account.
import { forgotPasswordInput } from '@/application/identity/schemas';
import { clientOf } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

/** Requests a password reset link. Always answers the same way. */
export const POST = defineEndpoint({
  method: 'POST',
  rateLimit: { bucket: 'auth', scope: 'forgot' },
  input: forgotPasswordInput,
  handler: async ({ input, context }) => {
    await context.locals.app.requestPasswordReset.execute(input, clientOf(context.request));
    return { sent: true };
  },
});
