// Facets of the catalog filter panel: categories, attribute values, the price range and the flag counts. Counts are
// disjunctive: each facet is counted without its own selection, so a visitor can still switch to a sibling value.
import type { CatalogQuery } from '@/domain/catalog/catalog-query';
import type { AttributeFacetDto, FacetsDto } from '@/application/dto/catalog-dto';
import { buildWhere, type Clause, type Exclusion } from './catalog-filters';
import { pickLabel } from './catalog-text';
import { queryAll, queryFirst } from './d1-client';

/**
 * Loads every facet of a query.
 * @param db D1 binding.
 * @param query Normalized query.
 * @param valueAttribute Map from attribute value id to its attribute id.
 * @param cutoff Start of the "new" window.
 * @returns The facets with their counts.
 */
export async function loadFacets(
  db: D1Database,
  query: CatalogQuery,
  valueAttribute: Map<string, string>,
  cutoff: string,
): Promise<FacetsDto> {
  const base = (exclude: Exclusion[]) => buildWhere(query, valueAttribute, cutoff, exclude);

  const categoryWhere = base(['category']);
  const categories = await queryAll<{ id: string; slug: string; name: string; n: number }>(
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
  );

  const attributes = await attributeFacets(db, query, base);

  const priceWhere = base(['price']);
  const price = await queryFirst<{ lo: number | null; hi: number | null }>(
    db,
    `SELECT MIN(p.min_price_minor) AS lo, MAX(p.max_price_minor) AS hi
       FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE ${priceWhere.sql}`,
    [query.locale, ...priceWhere.params],
  );

  const flagWhere = base(['stock', 'sale', 'new']);
  const flags = await queryFirst<{ stock: number; sale: number; newc: number }>(
    db,
    `SELECT
         COUNT(CASE WHEN EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 AND (v.track_inventory = 0 OR v.stock > 0)) THEN 1 END) AS stock,
         COUNT(CASE WHEN p.is_on_sale = 1 THEN 1 END) AS sale,
         COUNT(CASE WHEN p.created_at >= ? THEN 1 END) AS newc
       FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE ${flagWhere.sql}`,
    [cutoff, query.locale, ...flagWhere.params],
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
 * Builds the attribute facets. One query per filterable attribute, each ignoring that attribute's own selection.
 * @param db D1 binding.
 * @param query Normalized query.
 * @param base Factory for the WHERE clause with exclusions.
 * @returns Facets with counts.
 */
async function attributeFacets(
  db: D1Database,
  query: CatalogQuery,
  base: (exclude: Exclusion[]) => Clause,
): Promise<AttributeFacetDto[]> {
  const attributes = await queryAll<{
    id: string;
    code: string;
    name_json: string;
    display: 'buttons' | 'swatches';
  }>(db, 'SELECT id, code, name_json, display FROM attributes WHERE is_filterable = 1 ORDER BY position');
  const facets: AttributeFacetDto[] = [];
  for (const attribute of attributes) {
    const where = base([{ attributeId: attribute.id }]);
    const values = await queryAll<{ id: string; label_json: string; color_hex: string | null; n: number }>(
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
    facets.push({
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
    });
  }
  return facets.filter((facet) => facet.values.length > 0);
}
