// Catalog filter model. One parser turns URL parameters into a CatalogQuery; one serializer produces the
// canonical URL (sorted, de-duplicated, default values omitted). Pages use it to 301 non-canonical URLs,
// and the count API and the SEO indexing rule use the same model, so they never disagree.
import { isLocale, type Locale } from '../shared/locale';

/** Sort orders offered in the storefront. `relevance` only applies when there is a search term. */
export const CATALOG_SORTS = [
  'relevance',
  'newest',
  'price_asc',
  'price_desc',
  'best_sellers',
  'featured',
] as const;

/** One storefront sort order. */
export type CatalogSort = (typeof CATALOG_SORTS)[number];

/** Settings that affect parsing: price decimals of the store currency and the default sort. */
export interface CatalogOptions {
  /** Minor-unit exponent of the store currency (2 for cents, 0 for CLP). */
  exponent: number;
  defaultSort: CatalogSort;
}

/** The filters and sort the customer selected, normalized. */
export interface CatalogQuery {
  locale: Locale;
  q: string | null;
  /** Category slug from the path (or the index page's `category` parameter). */
  categorySlug: string | null;
  /** Attribute value ids, sorted and unique. Values inside one attribute are OR; attributes are AND. */
  valueIds: string[];
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
  inStock: boolean;
  onSale: boolean;
  isNew: boolean;
  sort: CatalogSort;
  page: number;
}

const MAX_SEARCH_LENGTH = 100;
const MAX_VALUE_IDS = 20;
const MAX_PAGE = 1000;
const MAX_PRICE_MAJOR = 1_000_000_000;
const VALUE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const CATEGORY_SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

/**
 * Checks whether a string is one of the storefront sort orders.
 * @param value Candidate sort name.
 * @returns True for supported sorts.
 */
function isCatalogSort(value: string | null): value is CatalogSort {
  return value !== null && (CATALOG_SORTS as readonly string[]).includes(value);
}

/**
 * Trims and collapses a search term, dropping it when empty.
 * @param raw Raw parameter value.
 * @returns Normalized term or null.
 */
function normalizeSearch(raw: string | null): string | null {
  const term = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_LENGTH);
  return term === '' ? null : term;
}

/**
 * Parses a major-unit price ("12.5") into minor units. Invalid or negative values return null (no filter).
 * @param raw Raw parameter value; a comma is accepted as decimal separator.
 * @param exponent Minor-unit exponent of the currency.
 * @returns Minor units or null.
 */
function parsePriceMinor(raw: string | null, exponent: number): number | null {
  if (raw === null || raw.trim() === '') return null;
  const major = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(major) || major < 0 || major > MAX_PRICE_MAJOR) return null;
  return Math.round(major * 10 ** exponent);
}

/**
 * Formats minor units back to a major-unit string without trailing zeros ("12.5", "12", "0.1").
 * @param minor Amount in minor units.
 * @param exponent Minor-unit exponent of the currency.
 * @returns Major-unit string.
 */
function formatPriceParam(minor: number, exponent: number): string {
  const text = (minor / 10 ** exponent).toFixed(exponent);
  return exponent === 0 ? text : text.replace(/\.?0+$/, '');
}

/**
 * Parses an integer parameter inside a range, falling back when it is missing or invalid.
 * @param raw Raw parameter value.
 * @param min Lowest allowed value.
 * @param max Highest allowed value.
 * @param fallback Value used when `raw` is missing or not an integer.
 * @returns Clamped integer.
 */
function parseIntInRange(raw: string | null, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Parses storefront URL parameters into a normalized CatalogQuery.
 * Invalid values are dropped instead of failing, so a hand-edited URL still renders a sensible page.
 * @param params URL search parameters.
 * @param locale Language of the page.
 * @param options Currency exponent and default sort.
 * @returns The normalized query.
 */
export function parseCatalogQuery(
  params: URLSearchParams,
  locale: Locale,
  options: CatalogOptions,
): CatalogQuery {
  const categoryRaw = (params.get('category') ?? '').trim().toLowerCase();
  const valueIds = [
    ...new Set(
      params
        .getAll('v')
        .map((v) => v.trim())
        .filter((v) => VALUE_ID_PATTERN.test(v)),
    ),
  ]
    .sort()
    .slice(0, MAX_VALUE_IDS);

  let minPriceMinor = parsePriceMinor(params.get('min'), options.exponent);
  let maxPriceMinor = parsePriceMinor(params.get('max'), options.exponent);
  if (minPriceMinor !== null && maxPriceMinor !== null && minPriceMinor > maxPriceMinor) {
    [minPriceMinor, maxPriceMinor] = [maxPriceMinor, minPriceMinor];
  }

  const q = normalizeSearch(params.get('q'));
  const requestedSort = params.get('sort');
  let sort: CatalogSort = isCatalogSort(requestedSort) ? requestedSort : options.defaultSort;
  if (sort === 'relevance' && q === null) sort = options.defaultSort;

  return {
    locale: isLocale(locale) ? locale : 'es',
    q,
    categorySlug: CATEGORY_SLUG_PATTERN.test(categoryRaw) ? categoryRaw : null,
    valueIds,
    minPriceMinor,
    maxPriceMinor,
    inStock: params.get('stock') === '1',
    onSale: params.get('sale') === '1',
    isNew: params.get('new') === '1',
    sort,
    page: parseIntInRange(params.get('page'), 1, MAX_PAGE, 1),
  };
}

/**
 * Serializes a query to its canonical parameter order. The category is part of the path, not the query,
 * so it is not serialized here; the index page redirects `?category=` to the category path.
 * @param query Normalized query.
 * @param options Currency exponent and default sort.
 * @returns URL search parameters in canonical order, with defaults omitted.
 */
export function catalogQueryToSearchParams(query: CatalogQuery, options: CatalogOptions): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q !== null) params.set('q', query.q);
  for (const id of [...query.valueIds].sort()) params.append('v', id);
  if (query.minPriceMinor !== null)
    params.set('min', formatPriceParam(query.minPriceMinor, options.exponent));
  if (query.maxPriceMinor !== null)
    params.set('max', formatPriceParam(query.maxPriceMinor, options.exponent));
  if (query.inStock) params.set('stock', '1');
  if (query.onSale) params.set('sale', '1');
  if (query.isNew) params.set('new', '1');
  if (query.sort !== options.defaultSort) params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

/**
 * Decides whether a URL may be indexed by search engines. Any filter, search term or non-default sort makes
 * it a combination page, which is kept out of the index. Pagination alone stays indexable.
 * @param query Normalized query.
 * @param options Currency exponent and default sort.
 * @returns True when the page can be indexed with a self-referencing canonical.
 */
export function isIndexableCatalogQuery(query: CatalogQuery, options: CatalogOptions): boolean {
  return !(
    query.q !== null ||
    query.valueIds.length > 0 ||
    query.minPriceMinor !== null ||
    query.maxPriceMinor !== null ||
    query.inStock ||
    query.onSale ||
    query.isNew ||
    query.sort !== options.defaultSort
  );
}
