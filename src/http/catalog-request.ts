// Storefront catalog request: parses the URL, redirects non-canonical URLs (301) and loads the listing data.
// Shop and category pages both use it, so the URL rules exist in one place.
import type { Container } from '@/composition/create-container';
import {
  catalogQueryToSearchParams,
  isIndexableCatalogQuery,
  parseCatalogQuery,
  type CatalogOptions,
  type CatalogQuery,
} from '@/domain/catalog/catalog-query';
import { CURRENCIES, type CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';
import type { Paginated } from '@/domain/shared/pagination';
import { PATHS } from '@/domain/shared/paths';
import type { CategoryDto, FacetsDto, ProductCardDto } from '@/application/dto/catalog-dto';
import { loadStoreContext, type StoreContext } from './store-context';

/** Everything a catalog page needs to render. */
export interface CatalogPage {
  query: CatalogQuery;
  options: CatalogOptions;
  basePath: string;
  indexable: boolean;
  store: StoreContext;
  listing: Paginated<ProductCardDto>;
  facets: FacetsDto;
  /** Active categories, for the filter panel's category links. */
  categories: CategoryDto[];
}

/** Either the page data, or a redirect to the canonical URL. */
export type CatalogLoad = { redirectTo: string } | CatalogPage;

/**
 * Joins a path and a query string, leaving the path alone when the query is empty.
 * @param path Path without query.
 * @param params Query parameters.
 * @returns Path with query.
 */
function withSearch(path: string, params: URLSearchParams): string {
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * The filters the language link keeps when a shopper switches language on a catalog page. Attribute values, prices, flags and
 * the sort mean the same in both languages; the search text and the page do not, so they are left out.
 * @param page The loaded catalog page.
 * @returns A query string with its "?", or an empty string when no filter is set.
 */
export function languageSwitchSearch(page: Pick<CatalogPage, 'query' | 'options'>): string {
  const params = catalogQueryToSearchParams({ ...page.query, q: null, page: 1 }, page.options);
  return withSearch('', params);
}

/**
 * Loads a catalog page for the shop index (no path category) or a category path.
 * @param app Request container.
 * @param url Request URL.
 * @param locale Page language.
 * @param pathCategory Category slug from the path, or null on the index page.
 * @returns Page data, or a redirect when the URL is not canonical.
 */
export async function loadCatalogPage(
  app: Container,
  url: URL,
  locale: Locale,
  pathCategory: string | null,
): Promise<CatalogLoad> {
  const store = await loadStoreContext(app);
  const options: CatalogOptions = {
    exponent: CURRENCIES[store.general.currency as CurrencyCode].exponent,
    defaultSort: store.catalog.defaultSort,
  };
  const parsed = parseCatalogQuery(url.searchParams, locale, options);
  const basePath = pathCategory ? PATHS.category(locale, pathCategory) : PATHS.shop(locale);

  // A category chosen in the query string moves to its own path, which is the canonical URL.
  if (pathCategory === null && parsed.categorySlug !== null) {
    const moved = catalogQueryToSearchParams({ ...parsed, categorySlug: null }, options);
    return { redirectTo: withSearch(PATHS.category(locale, parsed.categorySlug), moved) };
  }

  const query: CatalogQuery = { ...parsed, categorySlug: pathCategory ?? parsed.categorySlug };
  const canonical = withSearch(basePath, catalogQueryToSearchParams(query, options));
  if (url.pathname + url.search !== canonical) return { redirectTo: canonical };

  const service = app.catalog(store.catalog);
  const [listing, facets, categories] = await Promise.all([
    service.listProducts(query, store.catalog.pageSize),
    service.getFacets(query),
    service.listCategories(locale),
  ]);
  // A page past the end would be an empty page that search engines could index, under a message that blames the filters. Send
  // the visitor to the last page that exists instead.
  if (query.page > listing.totalPages) {
    return {
      redirectTo: withSearch(
        basePath,
        catalogQueryToSearchParams({ ...query, page: listing.totalPages }, options),
      ),
    };
  }
  return {
    query,
    options,
    basePath,
    indexable: isIndexableCatalogQuery(query, options),
    store,
    listing,
    facets,
    categories,
  };
}
