// First-owner setup. It works once and only with the SETUP_TOKEN secret; the use case refuses after an owner exists. Rate
// limited per IP, because the setup token is the only thing guarding the first account.
import { setupOwnerInput } from '@/application/identity/schemas';
import { DomainError } from '@/domain/shared/errors';
import { clientOf, sessionResponse } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

/** Creates the first owner and starts their session. Rate limited per IP. */
export const POST = defineEndpoint({
  method: 'POST',
  input: setupOwnerInput,
  handler: async ({ input, context }) => {
    const app = context.locals.app;
    const client = clientOf(context.request);
    if (!(await app.platform.rateLimiter.allow('auth', `setup:${client.ip ?? 'unknown'}`))) {
      throw new DomainError('RATE_LIMITED', 'Too many attempts. Please wait a moment.');
    }
    const { token, user } = await app.setupOwner.execute(input, client);
    return sessionResponse(context.url, token, { user });
  },
});
