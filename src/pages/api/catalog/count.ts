// Live result count for the filter panel. It reads the same URL parameters as the catalog pages and runs the same filters,
// so the number on the button matches the list the shopper gets after pressing it. Rate limited: it runs on every change.
import { parseCatalogQuery } from '@/domain/catalog/catalog-query';
import { DomainError } from '@/domain/shared/errors';
import { isLocale } from '@/domain/shared/locale';
import { defineEndpoint } from '@/http/define-endpoint';
import { loadStoreContext } from '@/http/store-context';
import { catalogOptionsFor } from '@/http/storefront';

export const GET = defineEndpoint({
  method: 'GET',
  handler: async ({ context }) => {
    const app = context.locals.app;
    const ip = context.request.headers.get('CF-Connecting-IP');
    if (!(await app.platform.rateLimiter.allow('api', ip ?? 'unknown'))) {
      throw new DomainError('RATE_LIMITED', 'Too many attempts. Please wait a moment.');
    }
    const locale = context.url.searchParams.get('locale') ?? '';
    if (!isLocale(locale)) throw new DomainError('VALIDATION_FAILED', 'Unknown language');
    const store = await loadStoreContext(app);
    const query = parseCatalogQuery(context.url.searchParams, locale, catalogOptionsFor(store));
    const count = await app.catalog({ newDays: store.catalog.newDays }).countProducts(query);
    return { count };
  },
});
