// Checkout endpoint: places the order and returns the next step. Rate limited per client IP; the bot check runs inside
// the use case. Prices, stock and totals are only ever decided here, never taken from the browser.
import { defineEndpoint } from '@/http/define-endpoint';
import { placeOrderInput } from '@/application/ordering/schemas';
import { consentCookieValue, marketingAllowed, parseConsent } from '@/domain/consent/consent';

export const POST = defineEndpoint({
  method: 'POST',
  rateLimit: 'forms',
  input: placeOrderInput,
  handler: async ({ input, context }) => {
    const app = context.locals.app;
    const ip = context.request.headers.get('CF-Connecting-IP');
    // The consent comes from the buyer's own cookie, never from the request body, so a client cannot claim it.
    const consent = parseConsent(consentCookieValue(context.request.headers.get('cookie')));
    return app.placeOrder.execute(input, { ip, marketingConsent: marketingAllowed(consent) });
  },
});
