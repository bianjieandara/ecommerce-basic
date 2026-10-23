// Facets of the catalog filter panel: categories, attribute values, the price range and the flag counts. Counts are
// disjunctive: each facet is counted without its own selection, so a visitor can still switch to a sibling value.
import type { CatalogQuery } from '@/domain/catalog/catalog-query';
import type { AttributeFacetDto, FacetsDto } from '@/application/dto/catalog-dto';
import { buildWhere, type Clause, type Exclusion } from './catalog-filters';
import { pickLabel } from './catalog-text';
import { statement } from './d1-client';

/** Rows of the category facet query. */
interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  n: number;
}

/** Rows of the attribute list. */
interface AttributeRow {
  id: string;
  code: string;
  name_json: string;
  display: 'buttons' | 'swatches';
}

/** Rows of one attribute's value counts. */
interface ValueRow {
  id: string;
  label_json: string;
  color_hex: string | null;
  n: number;
}

/**
 * Loads every facet of a query. The reads are independent, so they go out together: one batch for the categories, the price
 * range, the flag counts and the attribute list, then one batch with the value counts of every attribute.
 * @param db D1 binding.
 * @param query Normalized query.
 * @param valueAttribute Map from attribute value id to its attribute id.
 * @param cutoff Start of the "new" window.
 * @param hideOutOfStock True when the store hides products that cannot be bought.
 * @returns The facets with their counts.
 */
export async function loadFacets(
  db: D1Database,
  query: CatalogQuery,
  valueAttribute: Map<string, string>,
  cutoff: string,
  hideOutOfStock = false,
): Promise<FacetsDto> {
  const base = (exclude: Exclusion[]) => buildWhere(query, valueAttribute, cutoff, exclude, hideOutOfStock);
  const categoryWhere = base(['category']);
  const priceWhere = base(['price']);
  const flagWhere = base(['stock', 'sale', 'new']);

  const [categoryResult, priceResult, flagResult, attributeResult] = await db.batch([
    statement(
      db,
      `SELECT c.id, ct.slug, ct.name, COUNT(DISTINCT p.id) AS n
       FROM categories c
       JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
       JOIN product_categories pc ON pc.category_id = c.id
       JOIN products p ON p.id = pc.product_id
       JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE ${categoryWhere.sql}
       GROUP BY c.id ORDER BY c.position`,
      [query.locale, query.locale, ...categoryWhere.params],
    ),
    statement(
      db,
      `SELECT MIN(p.min_price_minor) AS lo, MAX(p.max_price_minor) AS hi
       FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE ${priceWhere.sql}`,
      [query.locale, ...priceWhere.params],
    ),
    statement(
      db,
      `SELECT
         COUNT(CASE WHEN EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 AND (v.track_inventory = 0 OR v.stock > 0)) THEN 1 END) AS stock,
         COUNT(CASE WHEN p.is_on_sale = 1 THEN 1 END) AS sale,
         COUNT(CASE WHEN p.created_at >= ? THEN 1 END) AS newc
       FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE ${flagWhere.sql}`,
      [cutoff, query.locale, ...flagWhere.params],
    ),
    statement(
      db,
      'SELECT id, code, name_json, display FROM attributes WHERE is_filterable = 1 ORDER BY position',
    ),
  ]);
  const categories = (categoryResult?.results ?? []) as CategoryRow[];
  const price = (priceResult?.results?.[0] ?? null) as { lo: number | null; hi: number | null } | null;
  const flags = (flagResult?.results?.[0] ?? null) as { stock: number; sale: number; newc: number } | null;
  const attributes = await attributeFacets(
    db,
    query,
    base,
    (attributeResult?.results ?? []) as AttributeRow[],
  );

  return {
    categories: categories.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      count: row.n,
      selected: row.slug === query.categorySlug,
    })),
    attributes,
    price: { minMinor: price?.lo ?? 0, maxMinor: price?.hi ?? 0 },
    counts: { inStock: flags?.stock ?? 0, onSale: flags?.sale ?? 0, isNew: flags?.newc ?? 0 },
  };
}

/**
 * Builds the attribute facets. Each attribute is counted without its own selection, so each needs its own WHERE; the queries
 * still go out in one batch.
 * @param db D1 binding.
 * @param query Normalized query.
 * @param base Factory for the WHERE clause with exclusions.
 * @param attributes The filterable attributes, in display order.
 * @returns Facets with counts, leaving out attributes that have no values.
 */
async function attributeFacets(
  db: D1Database,
  query: CatalogQuery,
  base: (exclude: Exclusion[]) => Clause,
  attributes: AttributeRow[],
): Promise<AttributeFacetDto[]> {
  if (attributes.length === 0) return [];
  const results = await db.batch(
    attributes.map((attribute) => {
      const where = base([{ attributeId: attribute.id }]);
      return statement(
        db,
        `SELECT av.id, av.label_json, av.color_hex, COUNT(DISTINCT p.id) AS n
         FROM attribute_values av
         JOIN variant_attribute_values vav ON vav.attribute_value_id = av.id
         JOIN product_variants v ON v.id = vav.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
         WHERE av.attribute_id = ? AND ${where.sql}
         GROUP BY av.id ORDER BY av.position`,
        [query.locale, attribute.id, ...where.params],
      );
    }),
  );
  const facets = attributes.map((attribute, index): AttributeFacetDto => {
    const values = (results[index]?.results ?? []) as ValueRow[];
    return {
      attributeId: attribute.id,
      code: attribute.code,
      label: pickLabel(attribute.name_json, query.locale),
      display: attribute.display,
      values: values.map((value) => ({
        id: value.id,
        label: pickLabel(value.label_json, query.locale),
        colorHex: value.color_hex,
        count: value.n,
        selected: query.valueIds.includes(value.id),
      })),
    };
  });
  return facets.filter((facet) => facet.values.length > 0);
}
