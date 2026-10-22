// Product cards of the storefront: the one SELECT that lists them and the mapping to the DTO. Listings and "products by id"
// share both, so a card looks the same wherever it is shown.
import type { ProductCardDto } from '@/application/dto/catalog-dto';
import { cardImageKey } from './catalog-text';

/** Row of a product card query. */
export interface CardRow {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  category_name: string | null;
  image_variants: string | null;
  second_image_variants: string | null;
  min_price_minor: number;
  max_price_minor: number;
  compare_at_price_minor: number | null;
  is_on_sale: number;
  created_at: string;
  variant_count: number;
  first_variant_id: string | null;
  in_stock: number;
}

/**
 * Subquery for the variants JSON of one product image, by position.
 * @param offset 0 for the first image, 1 for the second.
 * @returns SQL expression.
 */
function imageVariants(offset: number): string {
  return `(SELECT m.variants_json FROM product_images pi JOIN media_assets m ON m.id = pi.media_id WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1${offset > 0 ? ` OFFSET ${offset}` : ''})`;
}

/**
 * The card SELECT and FROM. It binds the locale twice, in this order: the category name, then the translation join. The
 * caller adds WHERE, ORDER BY and LIMIT.
 * @param withSecondImage Whether to load the hover image too (listings do, "products by id" does not).
 * @returns SQL text.
 */
export function cardSelect(withSecondImage: boolean): string {
  return `SELECT p.id, t.slug, t.name, t.short_description,
        (SELECT ct.name FROM product_categories pc JOIN category_translations ct ON ct.category_id = pc.category_id AND ct.locale = ? WHERE pc.product_id = p.id LIMIT 1) AS category_name,
        ${imageVariants(0)} AS image_variants,
        ${withSecondImage ? imageVariants(1) : 'NULL'} AS second_image_variants,
        p.min_price_minor, p.max_price_minor, p.compare_at_price_minor, p.is_on_sale, p.created_at,
        (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_count,
        (SELECT v.id FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 LIMIT 1) AS first_variant_id,
        EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 AND (v.track_inventory = 0 OR v.stock > 0)) AS in_stock
       FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ?`;
}

/**
 * Maps a card row to the DTO.
 * @param row Query row.
 * @param cutoff Start of the "new" window.
 * @returns Product card.
 */
export function toCard(row: CardRow, cutoff: string): ProductCardDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    categoryName: row.category_name ?? '',
    imageKey: cardImageKey(row.image_variants),
    secondImageKey: cardImageKey(row.second_image_variants),
    minPriceMinor: row.min_price_minor,
    maxPriceMinor: row.max_price_minor,
    compareAtPriceMinor: row.compare_at_price_minor,
    currency: '',
    isOnSale: row.is_on_sale === 1,
    isNew: row.created_at >= cutoff,
    inStock: row.in_stock === 1,
    hasVariants: row.variant_count > 1,
    singleVariantId: row.variant_count === 1 ? row.first_variant_id : null,
  };
}
