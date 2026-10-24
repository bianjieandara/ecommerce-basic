// Category admin: names and slugs per language, the parent tree, and the order of siblings.
import type { AdminUser } from '../ports/identity';
import { assertCan } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import { SUPPORTED_LOCALES, type Locale } from '@/domain/shared/locale';
import { slugify } from '@/domain/shared/slug';
import type { AdminCategory, CategoryRepository, CategoryText } from '../ports/catalog-admin';
import type { MediaRepository } from '../ports/media';
import type { Clock, IdGenerator } from '../ports/platform';
import type { CategoryInput } from './schemas';

/** Dependencies of ManageCategories. */
export interface ManageCategoriesDeps {
  categories: CategoryRepository;
  media: MediaRepository;
  ids: IdGenerator;
  clock: Clock;
}

/** Longest parent chain the cycle check walks. Deeper trees are refused rather than looped over. */
const MAX_DEPTH = 10;

/** Creates, edits, deletes and orders categories. */
export class ManageCategories {
  /** @param deps Repositories, ids and clock. */
  constructor(private readonly deps: ManageCategoriesDeps) {}

  /**
   * Creates or updates a category. Each language that has a name gets a slug, generated from the name when left empty.
   * @param actor The signed-in admin; needs the catalog permission.
   * @param input Validated category input.
   * @returns The category id.
   * @throws DomainError FORBIDDEN, NOT_FOUND, VALIDATION_FAILED (unknown parent or image, a cycle, no name), CONFLICT (slug taken).
   */
  async upsert(actor: AdminUser, input: CategoryInput): Promise<{ id: string }> {
    assertCan(actor.role, 'catalog.edit');
    const now = this.deps.clock.now().toISOString();
    const tree = await this.deps.categories.list();
    const existing = input.id ? tree.find((category) => category.id === input.id) : undefined;
    if (input.id && !existing) throw new DomainError('NOT_FOUND', 'Category not found');
    if (input.parentId) {
      if (!tree.some((category) => category.id === input.parentId)) {
        throw new DomainError('VALIDATION_FAILED', 'The parent category does not exist');
      }
      if (input.id) assertNoCycle(tree, input.id, input.parentId);
    }
    if (input.imageMediaId && (await this.deps.media.findManyByIds([input.imageMediaId])).length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'The image does not exist');
    }
    const translations = buildTranslations(input.translations);
    if (Object.keys(translations).length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Give the category a name in at least one language');
    }
    const category: AdminCategory = {
      id: input.id ?? this.deps.ids.newId(),
      parentId: input.parentId,
      imageMediaId: input.imageMediaId,
      position: input.position ?? existing?.position ?? tree.length,
      isActive: input.isActive,
      translations,
    };
    await this.deps.categories.save(category, now);
    return { id: category.id };
  }

  /**
   * Deletes a category that has no subcategories and no products.
   * @param actor The signed-in admin; needs the catalog permission.
   * @param id Category id.
   * @throws DomainError FORBIDDEN, NOT_FOUND, or CONFLICT while subcategories or products still use it.
   */
  async remove(actor: AdminUser, id: string): Promise<void> {
    assertCan(actor.role, 'catalog.edit');
    if (!(await this.deps.categories.findById(id))) throw new DomainError('NOT_FOUND', 'Category not found');
    const usage = await this.deps.categories.usage(id);
    if (usage.childCount > 0 || usage.productCount > 0) {
      throw new DomainError('CONFLICT', 'Move or remove its subcategories and products first');
    }
    await this.deps.categories.delete(id);
  }

  /**
   * Sets the order of categories: each id's position is its index in the list.
   * @param actor The signed-in admin; needs the catalog permission.
   * @param ids Category ids in the new order.
   * @throws DomainError FORBIDDEN, VALIDATION_FAILED for unknown or repeated ids.
   */
  async reorder(actor: AdminUser, ids: string[]): Promise<void> {
    assertCan(actor.role, 'catalog.edit');
    const unique = [...new Set(ids)];
    const known = await this.deps.categories.existingIds(unique);
    if (unique.length !== ids.length || known.length !== unique.length) {
      throw new DomainError('VALIDATION_FAILED', 'The list has unknown or repeated categories');
    }
    await this.deps.categories.reorder(unique, this.deps.clock.now().toISOString());
  }
}

/**
 * Keeps the languages that have a name and gives each a usable slug.
 * @param texts Typed text per language.
 * @returns Translations for the languages that have a name.
 * @throws DomainError VALIDATION_FAILED when a name has no letters or digits to build a slug from.
 */
function buildTranslations(texts: CategoryInput['translations']): Partial<Record<Locale, CategoryText>> {
  const result: Partial<Record<Locale, CategoryText>> = {};
  for (const locale of SUPPORTED_LOCALES) {
    const text = texts[locale];
    if (!text.name) continue;
    const slug = slugify(text.slug || text.name);
    if (!slug) throw new DomainError('VALIDATION_FAILED', 'The name needs at least one letter or digit');
    result[locale] = { name: text.name, slug, description: text.description };
  }
  return result;
}

/**
 * Refuses a parent that is the category itself or one of its descendants.
 * @param tree All categories.
 * @param id Category being edited.
 * @param parentId Proposed parent.
 * @throws DomainError VALIDATION_FAILED when the move would create a cycle.
 */
function assertNoCycle(tree: AdminCategory[], id: string, parentId: string): void {
  let cursor: string | null = parentId;
  for (let depth = 0; cursor !== null && depth <= MAX_DEPTH; depth += 1) {
    if (cursor === id) throw new DomainError('VALIDATION_FAILED', 'A category cannot sit under itself');
    const current: string = cursor;
    cursor = tree.find((category) => category.id === current)?.parentId ?? null;
  }
}
