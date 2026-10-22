// D1 side of categories: the tree, the translations, and the order of siblings.
import type {
  AdminCategory,
  CategoryRepository,
  CategoryText,
  CategoryUsage,
} from '@/application/ports/catalog-admin';
import { DomainError } from '@/domain/shared/errors';
import { SUPPORTED_LOCALES, type Locale } from '@/domain/shared/locale';
import { isUniqueViolation, queryAll, queryFirst, statement } from './d1-client';

/** Row of categories. */
interface CategoryRow {
  id: string;
  parent_id: string | null;
  image_media_id: string | null;
  position: number;
  is_active: number;
}

/** Row of category_translations. */
interface TextRow {
  category_id: string;
  locale: Locale;
  name: string;
  slug: string;
  description: string;
}

/** D1-backed category repository. The tree is small, so single lookups read it whole. */
export class D1CategoryRepository implements CategoryRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  /**
   * Lists every category with its translations, in display order.
   * @returns All categories.
   */
  async list(): Promise<AdminCategory[]> {
    const [rows, texts] = await Promise.all([
      queryAll<CategoryRow>(
        this.db,
        'SELECT id, parent_id, image_media_id, position, is_active FROM categories ORDER BY position, id',
      ),
      queryAll<TextRow>(
        this.db,
        'SELECT category_id, locale, name, slug, description FROM category_translations',
      ),
    ]);
    const byCategory = new Map<string, Partial<Record<Locale, CategoryText>>>();
    for (const text of texts) {
      const translations = byCategory.get(text.category_id) ?? {};
      translations[text.locale] = { name: text.name, slug: text.slug, description: text.description };
      byCategory.set(text.category_id, translations);
    }
    return rows.map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      imageMediaId: row.image_media_id,
      position: row.position,
      isActive: row.is_active === 1,
      translations: byCategory.get(row.id) ?? {},
    }));
  }

  /**
   * Finds one category.
   * @param id Category id.
   * @returns The category, or null.
   */
  async findById(id: string): Promise<AdminCategory | null> {
    return (await this.list()).find((category) => category.id === id) ?? null;
  }

  /**
   * The ids that exist among the given ones.
   * @param ids Candidate ids.
   * @returns The existing ids.
   */
  async existingIds(ids: string[]): Promise<string[]> {
    const rows = await queryAll<{ id: string }>(
      this.db,
      'SELECT id FROM categories WHERE id IN (SELECT value FROM json_each(?))',
      [JSON.stringify(ids)],
    );
    return rows.map((row) => row.id);
  }

  /**
   * Counts the rows that depend on a category.
   * @param id Category id.
   * @returns Subcategory and product counts.
   */
  async usage(id: string): Promise<CategoryUsage> {
    const row = await queryFirst<{ children: number; products: number }>(
      this.db,
      `SELECT (SELECT COUNT(*) FROM categories WHERE parent_id = ?) AS children,
              (SELECT COUNT(*) FROM product_categories WHERE category_id = ?) AS products`,
      [id, id],
    );
    return { childCount: row?.children ?? 0, productCount: row?.products ?? 0 };
  }

  /**
   * Inserts or updates a category and replaces its translations, in one batch.
   * @param category Category to save.
   * @param nowIso Time of the change.
   * @throws DomainError CONFLICT when a slug is already used in the same language.
   */
  async save(category: AdminCategory, nowIso: string): Promise<void> {
    const statements = [
      statement(
        this.db,
        `INSERT INTO categories (id, parent_id, image_media_id, position, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET parent_id = excluded.parent_id, image_media_id = excluded.image_media_id,
           position = excluded.position, is_active = excluded.is_active, updated_at = excluded.updated_at`,
        [
          category.id,
          category.parentId,
          category.imageMediaId,
          category.position,
          category.isActive ? 1 : 0,
          nowIso,
          nowIso,
        ],
      ),
      statement(this.db, 'DELETE FROM category_translations WHERE category_id = ?', [category.id]),
    ];
    for (const locale of SUPPORTED_LOCALES) {
      const text = category.translations[locale];
      if (!text) continue;
      statements.push(
        statement(
          this.db,
          'INSERT INTO category_translations (category_id, locale, name, slug, description) VALUES (?, ?, ?, ?, ?)',
          [category.id, locale, text.name, text.slug, text.description],
        ),
      );
    }
    try {
      await this.db.batch(statements);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new DomainError('CONFLICT', 'That slug is already used in this language');
      throw error;
    }
  }

  /**
   * Deletes a category. Its translations go with it.
   * @param id Category id.
   */
  async delete(id: string): Promise<void> {
    await statement(this.db, 'DELETE FROM categories WHERE id = ?', [id]).run();
  }

  /**
   * Sets each category's position to its index in the list.
   * @param ids Category ids in the new order.
   * @param nowIso Time of the change.
   */
  async reorder(ids: string[], nowIso: string): Promise<void> {
    await this.db.batch(
      ids.map((id, position) =>
        statement(this.db, 'UPDATE categories SET position = ?, updated_at = ? WHERE id = ?', [
          position,
          nowIso,
          id,
        ]),
      ),
    );
  }
}
