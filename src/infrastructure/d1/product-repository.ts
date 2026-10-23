// D1 side of the product aggregate: loads a product with everything it owns, and saves it in one batch.
import type { ProductRepository, ProductSaveContext } from '@/application/ports/catalog';
import type { StockChange } from '@/application/ports/inventory';
import type { Product, ProductStatus } from '@/domain/catalog/product';
import { DomainError } from '@/domain/shared/errors';
import { isCheckViolation, isUniqueViolation, queryAll, queryFirst, statement } from './d1-client';
import {
  toProduct,
  toVariant,
  type ProductRow,
  type TranslationRow,
  type VariantRow,
} from './product-mapper';
import { productStatements } from './product-statements';
import { stockChangesFrom } from './stock-ledger';

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
   * @param context Actor, note and stock changes.
   * @returns The stock changes, with the stock the ledger now holds.
   * @throws DomainError CONFLICT for a taken slug or SKU, or when stock changed underneath the save.
   */
  async save(product: Product, context: ProductSaveContext): Promise<StockChange[]> {
    const stored = await queryAll<{ id: string }>(
      this.db,
      'SELECT id FROM product_variants WHERE product_id = ?',
      [product.id],
    );
    const { statements, slots } = productStatements(
      this.db,
      product,
      context,
      new Set(stored.map((row) => row.id)),
    );
    let results: D1Result[];
    try {
      results = await this.db.batch(statements);
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError('CONFLICT', 'That slug or SKU is already in use');
      if (isCheckViolation(error)) {
        throw new DomainError('CONFLICT', 'Stock changed while saving. Reload the product and try again.');
      }
      throw error;
    }
    return stockChangesFrom(results, slots);
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
   * Changes the status of several products in one statement. The ids come back from the write itself (RETURNING), so an id
   * that does not exist is simply absent from the answer.
   * @param ids Product ids.
   * @param status New status.
   * @param nowIso Time of the change.
   * @returns The ids that were changed.
   */
  async setStatusMany(ids: readonly string[], status: ProductStatus, nowIso: string): Promise<string[]> {
    const rows = await queryAll<{ id: string }>(
      this.db,
      `UPDATE products SET status = ?, updated_at = ? WHERE id IN (SELECT value FROM json_each(?)) RETURNING id`,
      [status, nowIso, JSON.stringify(ids)],
    );
    return rows.map((row) => row.id);
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
}
