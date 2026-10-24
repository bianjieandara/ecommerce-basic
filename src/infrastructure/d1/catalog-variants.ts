// Variant lookups of the storefront: prices, stock and attribute labels for the cart quote, the product page and the feed.
// Rows and labels are two statements that go out in one batch, whichever way the variants are chosen (by id or by product).
import type { Locale } from '@/domain/shared/locale';
import type { QuoteVariantDto } from '@/application/dto/catalog-dto';
import { pickLabel } from './catalog-text';
import { statement, type SqlValue } from './d1-client';

/** Which variants a read is about, as a SQL list of ids and the values it binds. */
interface VariantSource {
  idsSql: string;
  binds: SqlValue[];
}

/** Variants named by id. The list travels as one JSON parameter, so its length never meets D1's bind limit. */
function byIds(variantIds: string[]): VariantSource {
  return { idsSql: 'SELECT value FROM json_each(?)', binds: [JSON.stringify(variantIds)] };
}

/** The active variants of one product. */
function ofProduct(productId: string): VariantSource {
  return {
    idsSql: 'SELECT id FROM product_variants WHERE product_id = ? AND is_active = 1',
    binds: [productId],
  };
}

/** Attribute label parts and value ids of the variants in a source, in attribute order. */
interface AttributeRow {
  variant_id: string;
  value_id: string;
  label_json: string;
}

/**
 * Statement for the attribute values of a set of variants.
 * @param db D1 binding.
 * @param source The variants.
 * @returns A statement that returns AttributeRow rows.
 */
function attributeStatement(db: D1Database, source: VariantSource): D1PreparedStatement {
  return statement(
    db,
    `SELECT vav.variant_id, av.id AS value_id, av.label_json
       FROM variant_attribute_values vav
       JOIN attribute_values av ON av.id = vav.attribute_value_id
       JOIN attributes a ON a.id = av.attribute_id
       WHERE vav.variant_id IN (${source.idsSql})
       ORDER BY a.position, av.position`,
    source.binds,
  );
}

/**
 * Joins the attribute rows into one label ("M / Red") and a value id list per variant.
 * @param rows Rows of attributeStatement.
 * @param locale Language for the labels.
 * @returns Map from variant id to its label and value ids.
 */
function groupAttributes(
  rows: AttributeRow[],
  locale: Locale,
): Map<string, { label: string; valueIds: string[] }> {
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
 * Labels such as "M / Red" and the attribute value ids of every active variant of an active product, for the product feed. The
 * variants are chosen in SQL, so the read has no list of ids to bind: a store with thousands of variants meets no parameter limit.
 * @param db D1 binding.
 * @param locale Language for the labels.
 * @returns Map from variant id to its label and value ids.
 */
export async function feedVariantAttributes(
  db: D1Database,
  locale: Locale,
): Promise<Map<string, { label: string; valueIds: string[] }>> {
  const source: VariantSource = {
    idsSql: `SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id AND p.status = 'active'
             WHERE v.is_active = 1`,
    binds: [],
  };
  const { results } = await attributeStatement(db, source).all<AttributeRow>();
  return groupAttributes(results, locale);
}

/** Row of the variant query. */
interface VariantRow {
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
}

/**
 * Reads the variants of a source and their labels together.
 * @param db D1 binding.
 * @param source The variants.
 * @param locale Language of the names and labels.
 * @returns One DTO per variant found, ordered by position.
 */
async function readVariants(
  db: D1Database,
  source: VariantSource,
  locale: Locale,
): Promise<QuoteVariantDto[]> {
  const [variants, attributeRows] = await db.batch([
    statement(
      db,
      `SELECT v.id, v.product_id, v.sku, v.price_minor, v.compare_at_price_minor, v.stock, v.track_inventory,
              v.image_media_id, v.is_active, v.cost_minor, p.base_price_minor, p.tax_rate_bp, p.status, t.name
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE v.id IN (${source.idsSql})
       ORDER BY v.position, v.id`,
      [locale, ...source.binds],
    ),
    attributeStatement(db, source),
  ]);
  const attributes = groupAttributes((attributeRows?.results ?? []) as AttributeRow[], locale);
  return ((variants?.results ?? []) as VariantRow[]).map((row) => ({
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

/**
 * Variants with their current price, stock and cost, for pricing a cart.
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
  return readVariants(db, byIds(variantIds), locale);
}

/**
 * The active variants of one product, in display order, for the product page.
 * @param db D1 binding.
 * @param productId Product id.
 * @param locale Language of the names and labels.
 * @returns One DTO per active variant.
 */
export function loadProductVariants(
  db: D1Database,
  productId: string,
  locale: Locale,
): Promise<QuoteVariantDto[]> {
  return readVariants(db, ofProduct(productId), locale);
}
