// SQL of an inventory row: one variant with its product name, slug, variant label, stock, threshold and thumbnail key.
// The screens, the scanner, the stock use cases and the alerts all read variants through this one select.
import type { InventoryRow } from '@/application/ports/inventory';
import { stockStatus, type StockReason } from '@/domain/inventory/stock';
import type { Locale } from '@/domain/shared/locale';
import type { SqlValue } from './d1-client';

/** Columns of INVENTORY_ROW_SELECT as the database returns them. */
export interface InventoryRecord {
  variant_id: string;
  product_id: string;
  sku: string | null;
  barcode: string | null;
  stock: number;
  track_inventory: number;
  cost_minor: number | null;
  price_minor: number;
  threshold: number;
  product_name: string | null;
  product_slug: string | null;
  variant_label: string | null;
  thumb_key: string | null;
}

/** Product name in the requested language; another language when that one is missing. Takes the locale as a bind. */
export const PRODUCT_NAME_SQL = `(SELECT t.name FROM product_translations t WHERE t.product_id = p.id ORDER BY (t.locale = ?) DESC LIMIT 1)`;

/** Variant label: the attribute values in attribute order, in the requested language. Takes the locale as a bind. */
export const VARIANT_LABEL_SQL = `(SELECT GROUP_CONCAT(label, ' / ') FROM (
  SELECT json_extract(av.label_json, '$.' || ?) AS label FROM variant_attribute_values vav
  JOIN attribute_values av ON av.id = vav.attribute_value_id JOIN attributes a ON a.id = av.attribute_id
  WHERE vav.variant_id = v.id ORDER BY a.position))`;

/** Storage key of the smallest stored image: the variant's own image, else the product's first one. */
const THUMB_KEY_SQL = `(SELECT json_extract(j.value, '$.key') FROM media_assets m, json_each(m.variants_json) j
  WHERE m.id = COALESCE(v.image_media_id,
    (SELECT i.media_id FROM product_images i WHERE i.product_id = p.id ORDER BY i.position LIMIT 1))
  ORDER BY json_extract(j.value, '$.width') LIMIT 1)`;

/**
 * The inventory row select. Its binds come first, in this order (see rowBinds); callers add their WHERE clause after it.
 */
export const INVENTORY_ROW_SELECT = `SELECT v.id AS variant_id, v.product_id, v.sku, v.barcode, v.stock, v.track_inventory,
  v.cost_minor, COALESCE(v.price_minor, p.base_price_minor) AS price_minor,
  COALESCE(v.low_stock_threshold, ?) AS threshold,
  ${PRODUCT_NAME_SQL} AS product_name,
  (SELECT t.slug FROM product_translations t WHERE t.product_id = p.id ORDER BY (t.locale = ?) DESC LIMIT 1) AS product_slug,
  ${VARIANT_LABEL_SQL} AS variant_label,
  ${THUMB_KEY_SQL} AS thumb_key
FROM product_variants v JOIN products p ON p.id = v.product_id`;

/**
 * Binds for INVENTORY_ROW_SELECT: the default threshold, then the locale for the name, the slug and the variant label.
 * @param defaultThreshold Store default low-stock threshold.
 * @param locale Language of the names.
 * @returns The binds, in placeholder order.
 */
export function rowBinds(defaultThreshold: number, locale: Locale): SqlValue[] {
  return [defaultThreshold, locale, locale, locale];
}

/**
 * Maps a row of INVENTORY_ROW_SELECT to the port's shape.
 * @param record Row from the database.
 * @returns The inventory row, with its status classified.
 */
export function toInventoryRow(record: InventoryRecord): InventoryRow {
  const tracked = record.track_inventory === 1;
  return {
    variantId: record.variant_id,
    productId: record.product_id,
    productName: record.product_name ?? '',
    productSlug: record.product_slug ?? '',
    variantLabel: record.variant_label ?? '',
    sku: record.sku,
    barcode: record.barcode,
    stock: record.stock,
    threshold: record.threshold,
    tracked,
    costMinor: record.cost_minor,
    priceMinor: record.price_minor,
    status: stockStatus(record.stock, record.threshold, tracked),
    thumbKey: record.thumb_key,
  };
}

/** A row of the movement ledger as the database returns it. */
export interface MovementRecord {
  id: string;
  variant_id: string;
  sku: string | null;
  delta: number;
  stock_after: number;
  reason: StockReason;
  reference: string | null;
  note: string | null;
  actor_name: string;
  created_at: string;
  product_name: string | null;
  variant_label: string | null;
}
