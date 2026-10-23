// Product suggestions for the storefront search box: products whose names start with the typed words. Short terms are not
// searched, because a one-letter prefix matches almost every product and costs a query for nothing.
import { DomainError } from '@/domain/shared/errors';
import { isLocale } from '@/domain/shared/locale';
import { PATHS } from '@/domain/shared/paths';
import { defineEndpoint } from '@/http/define-endpoint';
import { loadStoreContext } from '@/http/store-context';

/** Shortest search term that is looked up. */
const MIN_TERM_LENGTH = 2;

/** Suggestions returned at most; the list is for choosing a product, not for browsing results. */
const LIMIT = 6;

export const GET = defineEndpoint({
  method: 'GET',
  rateLimit: 'api',
  handler: async ({ context }) => {
    const app = context.locals.app;
    const locale = context.url.searchParams.get('locale') ?? '';
    if (!isLocale(locale)) throw new DomainError('VALIDATION_FAILED', 'Unknown language');
    const term = (context.url.searchParams.get('q') ?? '').trim();
    if (term.length < MIN_TERM_LENGTH) return { items: [] };
    const store = await loadStoreContext(app);
    const rows = await app.catalog(store.catalog).suggest(locale, term, LIMIT);
    return { items: rows.map((row) => ({ name: row.name, href: PATHS.product(locale, row.slug) })) };
  },
});
