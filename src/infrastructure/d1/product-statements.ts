// Statements that save one product aggregate. They run as a single D1 batch, so a product is never half saved.
import type { ProductSaveContext } from '@/application/ports/catalog';
import {
  computeIsOnSale,
  computePriceRange,
  type Product,
  type ProductVariant,
} from '@/domain/catalog/product';
import { SUPPORTED_LOCALES } from '@/domain/shared/locale';
import { boolToInt, statement } from './d1-client';
import { addStockChange, type LedgerSlot } from './stock-ledger';

/**
 * Builds the statements that write one product: the product row, its text and search rows, categories, images,
 * variants with their attribute values, and the stock movements the save causes.
 * @param db D1 binding.
 * @param product Aggregate to save.
 * @param context Actor, note and stock changes.
 * @param storedVariantIds Variant ids already stored for this product.
 * @returns Statements in the order they must run, and where the ledger row of each stock change sits in them (to read the
 * changes back from the batch's results).
 */
export function productStatements(
  db: D1Database,
  product: Product,
  context: ProductSaveContext,
  storedVariantIds: Set<string>,
): { statements: D1PreparedStatement[]; slots: LedgerSlot[] } {
  const { minPriceMinor, maxPriceMinor } = computePriceRange(product);
  const slots: LedgerSlot[] = [];
  const statements: D1PreparedStatement[] = [
    statement(
      db,
      `INSERT INTO products (id, status, base_price_minor, compare_at_price_minor, tax_rate_bp, min_price_minor, max_price_minor,
         is_on_sale, is_featured, sales_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, base_price_minor = excluded.base_price_minor,
         compare_at_price_minor = excluded.compare_at_price_minor, tax_rate_bp = excluded.tax_rate_bp,
         min_price_minor = excluded.min_price_minor, max_price_minor = excluded.max_price_minor,
         is_on_sale = excluded.is_on_sale, is_featured = excluded.is_featured, updated_at = excluded.updated_at`,
      [
        product.id,
        product.status,
        product.basePriceMinor,
        product.compareAtPriceMinor,
        product.taxRateBp,
        minPriceMinor,
        maxPriceMinor,
        boolToInt(computeIsOnSale(product)),
        boolToInt(product.isFeatured),
        product.createdAt,
        product.updatedAt,
      ],
    ),
    statement(db, 'DELETE FROM product_translations WHERE product_id = ?', [product.id]),
    statement(db, 'DELETE FROM product_search WHERE product_id = ?', [product.id]),
  ];

  // A language without a name has no text at all; the storefront then falls back to another language.
  for (const locale of SUPPORTED_LOCALES) {
    const text = product.translations[locale];
    if (!text.name) continue;
    statements.push(
      statement(
        db,
        `INSERT INTO product_translations (product_id, locale, name, slug, short_description, description_md, seo_title, seo_description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.id,
          locale,
          text.name,
          text.slug,
          text.shortDescription,
          text.descriptionMd,
          text.seoTitle,
          text.seoDescription,
        ],
      ),
      statement(
        db,
        'INSERT INTO product_search (product_id, locale, name, short_description) VALUES (?, ?, ?, ?)',
        [product.id, locale, text.name, text.shortDescription],
      ),
    );
  }

  statements.push(statement(db, 'DELETE FROM product_categories WHERE product_id = ?', [product.id]));
  for (const categoryId of product.categoryIds) {
    statements.push(
      statement(db, 'INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)', [
        product.id,
        categoryId,
      ]),
    );
  }

  statements.push(statement(db, 'DELETE FROM product_images WHERE product_id = ?', [product.id]));
  for (const [position, mediaId] of product.imageIds.entries()) {
    statements.push(
      statement(db, 'INSERT INTO product_images (product_id, media_id, position) VALUES (?, ?, ?)', [
        product.id,
        mediaId,
        position,
      ]),
    );
  }

  for (const variant of product.variants) {
    variantStatements(db, product, variant, context, storedVariantIds.has(variant.id), statements, slots);
  }

  // Variants that left the editor are deactivated, not deleted: their ledger rows reference them.
  statements.push(
    statement(
      db,
      'UPDATE product_variants SET is_active = 0 WHERE product_id = ? AND id NOT IN (SELECT value FROM json_each(?))',
      [product.id, JSON.stringify(product.variants.map((variant) => variant.id))],
    ),
  );
  return { statements, slots };
}

/**
 * Statements for one variant: its row, its attribute values, and its stock movement when the stock changes. A new
 * variant is inserted with zero stock, so its first stock arrives through the ledger like every other change.
 * @param db D1 binding.
 * @param product Parent product (for the id and the change time).
 * @param variant Variant to write.
 * @param context Actor, note and stock changes.
 * @param stored Whether the variant already exists in the database.
 * @param statements The batch being built; this variant's statements are appended in the order they must run.
 * @param slots Where the ledger rows of stock changes sit in the batch; this variant's slot is appended when its stock changes.
 */
function variantStatements(
  db: D1Database,
  product: Product,
  variant: ProductVariant,
  context: ProductSaveContext,
  stored: boolean,
  statements: D1PreparedStatement[],
  slots: LedgerSlot[],
): void {
  const fields = [
    variant.sku,
    variant.barcode,
    variant.priceMinor,
    variant.compareAtPriceMinor,
    variant.costMinor,
    boolToInt(variant.trackInventory),
    variant.lowStockThreshold,
    variant.imageMediaId,
    variant.position,
    boolToInt(variant.isActive),
  ];
  const row = stored
    ? statement(
        db,
        `UPDATE product_variants SET sku = ?, barcode = ?, price_minor = ?, compare_at_price_minor = ?, cost_minor = ?,
           track_inventory = ?, low_stock_threshold = ?, image_media_id = ?, position = ?, is_active = ?
         WHERE id = ?`,
        [...fields, variant.id],
      )
    : statement(
        db,
        `INSERT INTO product_variants (id, product_id, sku, barcode, price_minor, compare_at_price_minor, cost_minor,
           track_inventory, low_stock_threshold, image_media_id, position, is_active, stock)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [variant.id, product.id, ...fields],
      );

  const links = [
    statement(db, 'DELETE FROM variant_attribute_values WHERE variant_id = ?', [variant.id]),
    ...variant.attributeValueIds.map((valueId) =>
      statement(db, 'INSERT INTO variant_attribute_values (variant_id, attribute_value_id) VALUES (?, ?)', [
        variant.id,
        valueId,
      ]),
    ),
  ];

  statements.push(row, ...links);
  const delta = context.stockDeltas[variant.id] ?? 0;
  if (delta !== 0) {
    slots.push(
      addStockChange(db, statements, {
        variantId: variant.id,
        delta,
        reason: stored ? 'manual_adjust' : 'initial',
        reference: null,
        note: context.stockNote,
        actor: context.actorId,
        nowIso: product.updatedAt,
      }),
    );
  }
}
