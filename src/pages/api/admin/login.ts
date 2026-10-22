// Sign-in. The use case checks the bot challenge, the attempt limit and the password, and answers every wrong credential the
// same way. The session cookie is set on the answer.
import { loginInput } from '@/application/identity/schemas';
import { clientOf, sessionResponse } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

/** Signs an admin in and starts their session. */
export const POST = defineEndpoint({
  method: 'POST',
  rateLimit: { bucket: 'auth', scope: 'login' },
  input: loginInput,
  handler: async ({ input, context }) => {
    const { token, user } = await context.locals.app.login.execute(input, clientOf(context.request));
    return sessionResponse(context.url, token, { user });
  },
});
