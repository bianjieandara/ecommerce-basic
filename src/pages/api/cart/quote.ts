// Cart quote endpoint: returns the server's prices, stock-clamped quantities and totals for a cart.
// Public and read-only, so it is rate limited per client IP (see Stage 23 for the full checklist).
import { defineEndpoint } from '@/http/define-endpoint';
import { loadStoreContext } from '@/http/store-context';
import { quoteCartInput } from '@/application/cart/quote-cart';

export const POST = defineEndpoint({
  method: 'POST',
  input: quoteCartInput,
  handler: async ({ input, context }) => {
    const app = context.locals.app;
    const store = await loadStoreContext(app);
    return app.quoteCart({ newDays: store.catalog.newDays }).execute(input, {
      tax: store.tax,
      checkout: await app.settings.get('checkout'),
      defaultLocale: store.general.defaultLocale,
    });
  },
});
