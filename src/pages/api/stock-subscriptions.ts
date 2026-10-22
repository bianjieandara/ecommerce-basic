// Back-in-stock requests from the storefront. Rate limited per client IP; the bot check runs inside the use case.
import { subscribeInput } from '@/application/inventory/schemas';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  rateLimit: 'forms',
  input: subscribeInput,
  handler: async ({ input, context }) => {
    const app = context.locals.app;
    const ip = context.request.headers.get('CF-Connecting-IP');
    await app.inventory.subscribeBackInStock.execute(input, { ip });
    return { subscribed: true };
  },
});
