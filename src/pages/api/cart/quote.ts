// Cart quote endpoint: returns the server's prices, stock-clamped quantities and totals for a cart.
// Public and read-only, so it is rate limited per client IP (see Stage 23 for the full checklist).
import { defineEndpoint } from '@/http/define-endpoint';
import { loadStoreContext } from '@/http/store-context';
import { quoteCartInput } from '@/application/cart/quote-cart';
import { availablePaymentMethods } from '@/application/ordering/payment-methods';

export const POST = defineEndpoint({
  method: 'POST',
  rateLimit: 'api',
  input: quoteCartInput,
  handler: async ({ input, context }) => {
    const app = context.locals.app;
    const store = await loadStoreContext(app);
    const checkout = await app.settings.get('checkout');
    return app.quoteCart({ newDays: store.catalog.newDays }).execute(input, {
      tax: store.tax,
      paymentMethods: availablePaymentMethods(
        app.gateways,
        { checkout, contact: store.contact, country: store.general.country },
        store.general.currency,
      ),
    });
  },
});
