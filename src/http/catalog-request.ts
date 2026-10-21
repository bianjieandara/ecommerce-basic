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
import type { FacetsDto, ProductCardDto } from '@/application/dto/catalog-dto';
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

  const service = app.catalog({ newDays: store.catalog.newDays });
  const [listing, facets] = await Promise.all([
    service.listProducts(query, store.catalog.pageSize),
    service.getFacets(query),
  ]);
  return {
    query,
    options,
    basePath,
    indexable: isIndexableCatalogQuery(query, options),
    store,
    listing,
    facets,
  };
}
