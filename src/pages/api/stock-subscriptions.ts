// Back-in-stock requests from the storefront. Rate limited per client IP; the bot check runs inside the use case.
import { subscribeInput } from '@/application/inventory/schemas';
import { DomainError } from '@/domain/shared/errors';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: subscribeInput,
  handler: async ({ input, context }) => {
    const app = context.locals.app;
    const ip = context.request.headers.get('CF-Connecting-IP');
    if (!(await app.platform.rateLimiter.allow('forms', ip ?? 'unknown'))) {
      throw new DomainError('RATE_LIMITED', 'Too many attempts. Please wait a moment.');
    }
    await app.inventory.subscribeBackInStock.execute(input, { ip });
    return { subscribed: true };
  },
});
