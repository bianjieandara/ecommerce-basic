// Checkout endpoint: places the order and returns the next step. Rate limited per client IP; the bot check runs inside
// the use case. Prices, stock and totals are only ever decided here, never taken from the browser.
import { defineEndpoint } from '@/http/define-endpoint';
import { placeOrderInput } from '@/application/ordering/schemas';
import { DomainError } from '@/domain/shared/errors';

export const POST = defineEndpoint({
  method: 'POST',
  input: placeOrderInput,
  handler: async ({ input, context }) => {
    const app = context.locals.app;
    const ip = context.request.headers.get('CF-Connecting-IP');
    if (!(await app.platform.rateLimiter.allow('forms', ip ?? 'unknown'))) {
      throw new DomainError('RATE_LIMITED', 'Too many attempts. Please wait a moment.');
    }
    return app.placeOrder.execute(input, { ip });
  },
});
