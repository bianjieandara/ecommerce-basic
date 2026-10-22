// D1 side of the product aggregate: loads a product with everything it owns, and saves it in one batch.
import type { ProductRepository, ProductSaveContext } from '@/application/ports/catalog';
import type { StockChange } from '@/application/ports/inventory';
import {
  type Product,
  type ProductStatus,
  type ProductTranslation,
  type ProductVariant,
} from '@/domain/catalog/product';
import { DomainError } from '@/domain/shared/errors';
import type { Locale } from '@/domain/shared/locale';
import { isCheckViolation, isUniqueViolation, queryAll, queryFirst, statement } from './d1-client';
import { productStatements } from './product-statements';

/** Row of products. */
interface ProductRow {
  id: string;
  status: ProductStatus;
  base_price_minor: number;
  compare_at_price_minor: number | null;
  tax_rate_bp: number | null;
  is_featured: number;
  created_at: string;
  updated_at: string;
}

/** Row of product_translations. */
interface TranslationRow {
  locale: Locale;
  name: string;
  slug: string;
  short_description: string;
  description_md: string;
  seo_title: string;
  seo_description: string;
}

/** Row of product_variants. */
interface VariantRow {
  id: string;
  sku: string | null;
  barcode: string | null;
  price_minor: number | null;
  compare_at_price_minor: number | null;
  cost_minor: number | null;
  stock: number;
  track_inventory: number;
  low_stock_threshold: number | null;
  image_media_id: string | null;
  position: number;
  is_active: number;
}

/** D1-backed product repository. */
export class D1ProductRepository implements ProductRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  /**
   * Loads a product with its text, categories, images and variants (with their attribute values).
   * @param id Product id.
   * @returns The aggregate, or null when it does not exist.
   */
  async findById(id: string): Promise<Product | null> {
    const row = await queryFirst<ProductRow>(this.db, 'SELECT * FROM products WHERE id = ?', [id]);
    if (!row) return null;
    const [texts, categories, images, variants, links] = await Promise.all([
      queryAll<TranslationRow>(this.db, 'SELECT * FROM product_translations WHERE product_id = ?', [id]),
      queryAll<{ category_id: string }>(
        this.db,
        'SELECT category_id FROM product_categories WHERE product_id = ? ORDER BY category_id',
        [id],
      ),
      queryAll<{ media_id: string }>(
        this.db,
        'SELECT media_id FROM product_images WHERE product_id = ? ORDER BY position',
        [id],
      ),
      queryAll<VariantRow>(
        this.db,
        'SELECT * FROM product_variants WHERE product_id = ? ORDER BY position, id',
        [id],
      ),
      queryAll<{ variant_id: string; attribute_value_id: string }>(
        this.db,
        `SELECT vav.variant_id, vav.attribute_value_id FROM variant_attribute_values vav
         JOIN product_variants v ON v.id = vav.variant_id WHERE v.product_id = ? ORDER BY vav.attribute_value_id`,
        [id],
      ),
    ]);
    const valuesByVariant = new Map<string, string[]>();
    for (const link of links) {
      valuesByVariant.set(link.variant_id, [
        ...(valuesByVariant.get(link.variant_id) ?? []),
        link.attribute_value_id,
      ]);
    }
    return toProduct(
      row,
      texts,
      categories.map((category) => category.category_id),
      images.map((image) => image.media_id),
      variants.map((variant) => toVariant(variant, valuesByVariant.get(variant.id) ?? [])),
    );
  }

  /**
   * Saves the aggregate in one batch and reports the stock changes it caused.
   * @param product Aggregate to save.
   * @param context Actor, note, stock changes and fallback threshold.
   * @returns The stock changes, with the stock the ledger now holds.
   * @throws DomainError CONFLICT for a taken slug or SKU, or when stock changed underneath the save.
   */
  async save(product: Product, context: ProductSaveContext): Promise<StockChange[]> {
    const stored = await queryAll<{ id: string }>(
      this.db,
      'SELECT id FROM product_variants WHERE product_id = ?',
      [product.id],
    );
    try {
      await this.db.batch(productStatements(this.db, product, context, new Set(stored.map((row) => row.id))));
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError('CONFLICT', 'That slug or SKU is already in use');
      if (isCheckViolation(error)) {
        throw new DomainError('CONFLICT', 'Stock changed while saving. Reload the product and try again.');
      }
      throw error;
    }
    return this.stockChanges(product, context);
  }

  /**
   * Changes only the status.
   * @param id Product id.
   * @param status New status.
   * @param nowIso Time of the change.
   */
  async setStatus(id: string, status: ProductStatus, nowIso: string): Promise<void> {
    await statement(this.db, 'UPDATE products SET status = ?, updated_at = ? WHERE id = ?', [
      status,
      nowIso,
      id,
    ]).run();
  }

  /**
   * Deletes a product that has never had stock movements. Products with history are archived instead.
   * @param id Product id.
   * @throws DomainError CONFLICT when the product has stock history.
   */
  async delete(id: string): Promise<void> {
    const movements = await queryFirst<{ n: number }>(
      this.db,
      'SELECT COUNT(*) AS n FROM inventory_movements WHERE product_id = ?',
      [id],
    );
    if ((movements?.n ?? 0) > 0) {
      throw new DomainError('CONFLICT', 'A product with stock history is archived, not deleted');
    }
    await this.db.batch([
      statement(this.db, 'DELETE FROM product_search WHERE product_id = ?', [id]),
      statement(this.db, 'DELETE FROM products WHERE id = ?', [id]),
    ]);
  }

  /**
   * The stock changes of a save, with the stock the ledger holds after it. Read after the batch, so a concurrent sale
   * shows up in `after` and in the ledger.
   * @param product Saved product.
   * @param context Stock changes of the save.
   * @returns One change per variant whose stock moved.
   */
  private async stockChanges(product: Product, context: ProductSaveContext): Promise<StockChange[]> {
    const changed = product.variants.filter((variant) => (context.stockDeltas[variant.id] ?? 0) !== 0);
    if (changed.length === 0) return [];
    const rows = await queryAll<{ id: string; stock: number }>(
      this.db,
      'SELECT id, stock FROM product_variants WHERE id IN (SELECT value FROM json_each(?))',
      [JSON.stringify(changed.map((variant) => variant.id))],
    );
    const stockNow = new Map(rows.map((row): [string, number] => [row.id, row.stock]));
    return changed.map((variant) => {
      const delta = context.stockDeltas[variant.id] ?? 0;
      const after = stockNow.get(variant.id) ?? variant.stock;
      return {
        variantId: variant.id,
        productId: product.id,
        before: after - delta,
        after,
        threshold: variant.lowStockThreshold ?? context.defaultLowStockThreshold,
      };
    });
  }
}

/**
 * Maps the rows of one product to the domain aggregate. A language without text keeps empty fields.
 * @param row Product row.
 * @param texts Translation rows.
 * @param categoryIds Category ids.
 * @param imageIds Image ids in display order.
 * @param variants Variants with their attribute values.
 * @returns The aggregate.
 */
function toProduct(
  row: ProductRow,
  texts: TranslationRow[],
  categoryIds: string[],
  imageIds: string[],
  variants: ProductVariant[],
): Product {
  const translations: Record<Locale, ProductTranslation> = { es: emptyTranslation(), en: emptyTranslation() };
  for (const text of texts) {
    translations[text.locale] = {
      name: text.name,
      slug: text.slug,
      shortDescription: text.short_description,
      descriptionMd: text.description_md,
      seoTitle: text.seo_title,
      seoDescription: text.seo_description,
    };
  }
  return {
    id: row.id,
    status: row.status,
    basePriceMinor: row.base_price_minor,
    compareAtPriceMinor: row.compare_at_price_minor,
    taxRateBp: row.tax_rate_bp,
    isFeatured: row.is_featured === 1,
    translations,
    categoryIds,
    imageIds,
    variants,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Maps a variant row to the domain shape.
 * @param row Variant row.
 * @param attributeValueIds Attribute value ids of the variant.
 * @returns The variant.
 */
function toVariant(row: VariantRow, attributeValueIds: string[]): ProductVariant {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    priceMinor: row.price_minor,
    compareAtPriceMinor: row.compare_at_price_minor,
    costMinor: row.cost_minor,
    stock: row.stock,
    trackInventory: row.track_inventory === 1,
    lowStockThreshold: row.low_stock_threshold,
    imageMediaId: row.image_media_id,
    position: row.position,
    isActive: row.is_active === 1,
    attributeValueIds,
  };
}

/**
 * A translation with no text, used for languages the product does not have yet.
 * @returns Empty fields.
 */
function emptyTranslation(): ProductTranslation {
  return { name: '', slug: '', shortDescription: '', descriptionMd: '', seoTitle: '', seoDescription: '' };
}
