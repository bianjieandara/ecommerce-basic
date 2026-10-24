// Two small storefront reads that follow a product or a category: the same category in the other language, and the products
// to suggest next to a product.
import type { Locale } from '@/domain/shared/locale';
import { cardSelect, type CardRow } from './catalog-cards';
import { queryAll } from './d1-client';

/**
 * Slug of a category in every language that has one, for the language switch. The category is named by the slug the visitor
 * used, so this read does not wait for the category lookup.
 * @param db D1 binding.
 * @param locale Language of the slug.
 * @param slug Category slug in that language.
 * @returns Slug per language (a language without a translation is missing; an unknown slug gives none).
 */
export async function loadCategoryAlternates(
  db: D1Database,
  locale: Locale,
  slug: string,
): Promise<Partial<Record<Locale, string>>> {
  const rows = await queryAll<{ locale: Locale; slug: string }>(
    db,
    `SELECT locale, slug FROM category_translations
      WHERE category_id = (SELECT category_id FROM category_translations WHERE locale = ? AND slug = ?)`,
    [locale, slug],
  );
  return Object.fromEntries(rows.map((row) => [row.locale, row.slug]));
}

/**
 * Cards of active products that share a category with a product, most shared categories first, then featured, then best selling.
 * The ids and the cards come from one statement: the ranking picks the ids, then the cards are loaded for those ids only.
 * @param db D1 binding.
 * @param productId The product the suggestions are for (never in the result).
 * @param locale Language: products without a translation in it are skipped, since their card could not be built.
 * @param limit Most cards to return.
 * @returns Card rows in suggestion order.
 */
export async function loadRelatedCards(
  db: D1Database,
  productId: string,
  locale: Locale,
  limit: number,
): Promise<CardRow[]> {
  return queryAll<CardRow>(
    db,
    `WITH related AS (
       SELECT p.id
         FROM product_categories mine
         JOIN product_categories pc ON pc.category_id = mine.category_id AND pc.product_id <> mine.product_id
         JOIN products p ON p.id = pc.product_id AND p.status = 'active'
         JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
         WHERE mine.product_id = ?
         GROUP BY p.id
         ORDER BY COUNT(*) DESC, p.is_featured DESC, p.sales_count DESC, p.id
         LIMIT ?)
     ${cardSelect(false)}
     WHERE p.id IN (SELECT id FROM related)
     ORDER BY (SELECT COUNT(*) FROM product_categories a JOIN product_categories b ON b.category_id = a.category_id
                WHERE a.product_id = ? AND b.product_id = p.id) DESC,
              p.is_featured DESC, p.sales_count DESC, p.id`,
    [locale, productId, limit, locale, locale, productId],
  );
}
