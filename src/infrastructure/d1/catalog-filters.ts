// The one WHERE builder of the storefront catalog. Listings, counts and facets all use it, so every number on the page is
// computed the same way. Facet counts are disjunctive: each facet leaves out its own selection.
import type { CatalogQuery } from '@/domain/catalog/catalog-query';
import type { SqlValue } from './d1-client';
import { toPrefixQuery } from './catalog-text';

/** One filter that a facet may ignore when it counts its own values. */
export type Exclusion = 'search' | 'category' | 'price' | 'stock' | 'sale' | 'new' | { attributeId: string };

/** A SQL fragment with its bound values. */
export interface Clause {
  sql: string;
  params: SqlValue[];
}

/** Options that come from store settings. */
export interface CatalogQueryOptions {
  /** Products created within this many days show the "new" badge. */
  newDays: number;
  /** Current time, injected for tests and the new-products cutoff. */
  now: () => Date;
}

/**
 * ISO timestamp before which products are no longer "new".
 * @param options Settings-derived options.
 * @returns The cutoff.
 */
export function newCutoff(options: CatalogQueryOptions): string {
  return new Date(options.now().getTime() - options.newDays * 86_400_000).toISOString();
}

/**
 * Builds the WHERE clause for the query, skipping the exclusions (used by disjunctive facet counts).
 * @param query Normalized query.
 * @param valueAttribute Map from attribute value id to its attribute id.
 * @param cutoff Start of the "new" window, from newCutoff.
 * @param exclude Filters to leave out.
 * @returns SQL fragment (always valid) and its parameters.
 */
export function buildWhere(
  query: CatalogQuery,
  valueAttribute: Map<string, string>,
  cutoff: string,
  exclude: Exclusion[] = [],
): Clause {
  const skip = (key: Exclusion) => exclude.some((item) => JSON.stringify(item) === JSON.stringify(key));
  const parts: string[] = ["p.status = 'active'"];
  const params: SqlValue[] = [];

  if (query.q !== null && !skip('search')) {
    const prefix = toPrefixQuery(query.q);
    if (prefix) {
      parts.push(
        'p.id IN (SELECT product_id FROM product_search WHERE product_search MATCH ? AND locale = ?)',
      );
      params.push(prefix, query.locale);
    } else {
      parts.push('0');
    }
  }
  if (query.categorySlug !== null && !skip('category')) {
    parts.push(
      'p.id IN (SELECT pc.product_id FROM product_categories pc JOIN category_translations ct ON ct.category_id = pc.category_id AND ct.locale = ? WHERE ct.slug = ?)',
    );
    params.push(query.locale, query.categorySlug);
  }

  const groups = new Map<string, string[]>();
  for (const valueId of query.valueIds) {
    const attributeId = valueAttribute.get(valueId);
    if (!attributeId) {
      parts.push('0');
      continue;
    }
    groups.set(attributeId, [...(groups.get(attributeId) ?? []), valueId]);
  }
  for (const [attributeId, values] of groups) {
    if (skip({ attributeId })) continue;
    parts.push(
      `EXISTS (SELECT 1 FROM product_variants v JOIN variant_attribute_values vav ON vav.variant_id = v.id WHERE v.product_id = p.id AND vav.attribute_value_id IN (${values.map(() => '?').join(',')}))`,
    );
    params.push(...values);
  }

  if (query.minPriceMinor !== null && !skip('price')) {
    parts.push('p.min_price_minor >= ?');
    params.push(query.minPriceMinor);
  }
  if (query.maxPriceMinor !== null && !skip('price')) {
    parts.push('p.min_price_minor <= ?');
    params.push(query.maxPriceMinor);
  }
  if (query.inStock && !skip('stock')) {
    parts.push(
      'EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 AND (v.track_inventory = 0 OR v.stock > 0))',
    );
  }
  if (query.onSale && !skip('sale')) parts.push('p.is_on_sale = 1');
  if (query.isNew && !skip('new')) {
    parts.push('p.created_at >= ?');
    params.push(cutoff);
  }
  return { sql: parts.join(' AND '), params };
}

/**
 * ORDER BY clause for a sort. Relevance falls back to newest, because FTS rank is not exposed here.
 * @param sort Sort name from the query.
 * @returns SQL ORDER BY expression.
 */
export function orderByFor(sort: CatalogQuery['sort']): string {
  switch (sort) {
    case 'price_asc':
      return 'p.min_price_minor ASC, p.id';
    case 'price_desc':
      return 'p.min_price_minor DESC, p.id';
    case 'best_sellers':
      return 'p.sales_count DESC, p.id';
    case 'featured':
      return 'p.is_featured DESC, p.created_at DESC';
    case 'newest':
    case 'relevance':
      return 'p.created_at DESC, p.id';
  }
}
