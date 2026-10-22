// Variant lookups of the storefront: prices, stock and attribute labels for the cart quote, the product page and the feed.
import type { Locale } from '@/domain/shared/locale';
import type { QuoteVariantDto } from '@/application/dto/catalog-dto';
import { pickLabel } from './catalog-text';
import { queryAll } from './d1-client';

/**
 * Labels such as "M / Red" and the attribute value ids of each variant, in attribute order.
 * @param db D1 binding.
 * @param variantIds Variant ids.
 * @param locale Language for the labels.
 * @returns Map from variant id to its label and value ids.
 */
export async function variantAttributes(
  db: D1Database,
  variantIds: string[],
  locale: Locale,
): Promise<Map<string, { label: string; valueIds: string[] }>> {
  if (variantIds.length === 0) return new Map();
  const rows = await queryAll<{ variant_id: string; value_id: string; label_json: string }>(
    db,
    `SELECT vav.variant_id, av.id AS value_id, av.label_json
       FROM variant_attribute_values vav
       JOIN attribute_values av ON av.id = vav.attribute_value_id
       JOIN attributes a ON a.id = av.attribute_id
       WHERE vav.variant_id IN (${variantIds.map(() => '?').join(',')})
       ORDER BY a.position, av.position`,
    variantIds,
  );
  const grouped = new Map<string, { label: string; valueIds: string[] }>();
  for (const row of rows) {
    const entry = grouped.get(row.variant_id) ?? { label: '', valueIds: [] };
    const part = pickLabel(row.label_json, locale);
    entry.label = entry.label ? `${entry.label} / ${part}` : part;
    entry.valueIds.push(row.value_id);
    grouped.set(row.variant_id, entry);
  }
  return grouped;
}

/**
 * Variants with their current price, stock and cost, for pricing a cart and for the product page.
 * @param db D1 binding.
 * @param variantIds Variant ids; unknown ids are missing from the result.
 * @param locale Language of the names and labels.
 * @returns One DTO per variant found.
 */
export async function loadQuoteVariants(
  db: D1Database,
  variantIds: string[],
  locale: Locale,
): Promise<QuoteVariantDto[]> {
  if (variantIds.length === 0) return [];
  const rows = await queryAll<{
    id: string;
    product_id: string;
    sku: string | null;
    price_minor: number | null;
    compare_at_price_minor: number | null;
    stock: number;
    track_inventory: number;
    image_media_id: string | null;
    is_active: number;
    base_price_minor: number;
    tax_rate_bp: number | null;
    cost_minor: number | null;
    name: string;
    status: string;
  }>(
    db,
    `SELECT v.id, v.product_id, v.sku, v.price_minor, v.compare_at_price_minor, v.stock, v.track_inventory,
              v.image_media_id, v.is_active, v.cost_minor, p.base_price_minor, p.tax_rate_bp, p.status, t.name
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE v.id IN (${variantIds.map(() => '?').join(',')})`,
    [locale, ...variantIds],
  );
  const attributes = await variantAttributes(db, variantIds, locale);
  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.name,
    variantLabel: attributes.get(row.id)?.label ?? '',
    sku: row.sku,
    priceMinor: row.price_minor ?? row.base_price_minor,
    compareAtPriceMinor: row.compare_at_price_minor,
    taxRateBp: row.tax_rate_bp,
    costMinor: row.cost_minor,
    stock: row.stock,
    trackInventory: row.track_inventory === 1,
    imageKey: null,
    attributeValueIds: attributes.get(row.id)?.valueIds ?? [],
    isActive: row.is_active === 1 && row.status === 'active',
  }));
}
