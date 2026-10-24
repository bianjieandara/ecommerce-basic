// The product feed read model: one item per active variant of an active product, for the Meta and Google catalog feed.
import type { Locale } from '@/domain/shared/locale';
import type { FeedItemDto } from '@/application/dto/catalog-dto';
import { cardImageKey } from './catalog-text';
import { feedVariantAttributes } from './catalog-variants';
import { queryAll } from './d1-client';

/**
 * Loads the feed items in a language.
 * @param db D1 binding.
 * @param locale Language of the names and labels.
 * @returns One item per active variant.
 */
export async function loadFeed(db: D1Database, locale: Locale): Promise<FeedItemDto[]> {
  const rows = await queryAll<{
    product_id: string;
    variant_id: string;
    slug: string;
    name: string;
    description: string;
    image_variants: string | null;
    price_minor: number | null;
    base_price_minor: number;
    compare_at_price_minor: number | null;
    in_stock: number;
    sku: string | null;
  }>(
    db,
    `SELECT p.id AS product_id, v.id AS variant_id, t.slug, t.name, t.short_description AS description,
        (SELECT m.variants_json FROM product_images pi JOIN media_assets m ON m.id = pi.media_id WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1) AS image_variants,
        v.price_minor, p.base_price_minor, COALESCE(v.compare_at_price_minor, p.compare_at_price_minor) AS compare_at_price_minor,
        (v.track_inventory = 0 OR v.stock > 0) AS in_stock, v.sku
       FROM product_variants v
       JOIN products p ON p.id = v.product_id AND p.status = 'active'
       JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE v.is_active = 1`,
    [locale],
  );
  const attributes = await feedVariantAttributes(db, locale);
  return rows.map((row) => ({
    productId: row.product_id,
    variantId: row.variant_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    imageKey: cardImageKey(row.image_variants),
    priceMinor: row.price_minor ?? row.base_price_minor,
    compareAtPriceMinor: row.compare_at_price_minor,
    inStock: row.in_stock === 1,
    variantLabel: attributes.get(row.variant_id)?.label ?? '',
    sku: row.sku,
    color: null,
    size: null,
  }));
}
