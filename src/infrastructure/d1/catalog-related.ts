// Two small storefront reads that follow a product or a category: the same category in the other language, and the products
// to suggest next to a product.
import type { Locale } from '@/domain/shared/locale';
import { queryAll } from './d1-client';

/**
 * Slug of a category in every language that has one, for the language switch.
 * @param db D1 binding.
 * @param categoryId Category id.
 * @returns Slug per language (a language without a translation is missing).
 */
export async function loadCategoryAlternates(
  db: D1Database,
  categoryId: string,
): Promise<Partial<Record<Locale, string>>> {
  const rows = await queryAll<{ locale: Locale; slug: string }>(
    db,
    'SELECT locale, slug FROM category_translations WHERE category_id = ?',
    [categoryId],
  );
  return Object.fromEntries(rows.map((row) => [row.locale, row.slug]));
}

/**
 * Ids of active products that share a category with a product, most shared categories first, then featured, then best selling.
 * @param db D1 binding.
 * @param productId The product the suggestions are for (never in the result).
 * @param locale Language: products without a translation in it are skipped, since their card could not be built.
 * @param limit Most ids to return.
 * @returns Product ids in suggestion order.
 */
export async function loadRelatedProductIds(
  db: D1Database,
  productId: string,
  locale: Locale,
  limit: number,
): Promise<string[]> {
  const rows = await queryAll<{ id: string }>(
    db,
    `SELECT p.id
       FROM product_categories mine
       JOIN product_categories pc ON pc.category_id = mine.category_id AND pc.product_id <> mine.product_id
       JOIN products p ON p.id = pc.product_id AND p.status = 'active'
       JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE mine.product_id = ?
       GROUP BY p.id
       ORDER BY COUNT(*) DESC, p.is_featured DESC, p.sales_count DESC, p.id
       LIMIT ?`,
    [locale, productId, limit],
  );
  return rows.map((row) => row.id);
}
