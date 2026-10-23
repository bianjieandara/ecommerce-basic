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
  rateLimit: 'api',
  handler: async ({ context }) => {
    const app = context.locals.app;
    const locale = context.url.searchParams.get('locale') ?? '';
    if (!isLocale(locale)) throw new DomainError('VALIDATION_FAILED', 'Unknown language');
    const store = await loadStoreContext(app);
    const query = parseCatalogQuery(context.url.searchParams, locale, catalogOptionsFor(store));
    const count = await app.catalog(store.catalog).countProducts(query);
    return { count };
  },
});
