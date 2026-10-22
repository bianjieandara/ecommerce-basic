// First-owner setup. It works once and only with the SETUP_TOKEN secret; the use case refuses after an owner exists. Rate
// limited per IP, because the setup token is the only thing guarding the first account.
import { setupOwnerInput } from '@/application/identity/schemas';
import { clientOf, sessionResponse } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

/** Creates the first owner and starts their session. Rate limited per IP. */
export const POST = defineEndpoint({
  method: 'POST',
  rateLimit: { bucket: 'auth', scope: 'setup' },
  input: setupOwnerInput,
  handler: async ({ input, context }) => {
    const app = context.locals.app;
    const client = clientOf(context.request);
    const { token, user } = await app.setupOwner.execute(input, client);
    return sessionResponse(context.url, token, { user });
  },
});
