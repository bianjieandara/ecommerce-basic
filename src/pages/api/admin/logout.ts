// Sign-out. It takes no body, so the admin header can post a plain form. The answer redirects to sign-in with the session
// cookie cleared, which also works when the session has already expired.
import { ADMIN_PATHS } from '@/domain/shared/paths';
import { sessionTokenOf, signedOutResponse } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: async ({ context }) => {
    const token = sessionTokenOf(context.request);
    if (token) await context.locals.app.sessions.revoke(token);
    return signedOutResponse(context.url, ADMIN_PATHS.login);
  },
});
