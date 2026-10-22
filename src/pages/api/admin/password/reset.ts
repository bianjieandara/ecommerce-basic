// Sets a new password from a reset or invitation link. The link is the secret: it is random, single use and expires. Every
// session of the account ends, so whoever held an old session is signed out.
import { resetPasswordInput } from '@/application/identity/schemas';
import { defineEndpoint } from '@/http/define-endpoint';

/** Sets a new password from a reset or invitation link. */
export const POST = defineEndpoint({
  method: 'POST',
  input: resetPasswordInput,
  handler: async ({ input, context }) => {
    await context.locals.app.resetPassword.execute(input);
    return { reset: true };
  },
});
