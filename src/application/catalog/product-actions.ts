// Product actions from the admin list: a status change that never touches stock, and a duplicate that starts as a draft.
import type { AdminUser } from '../ports/identity';
import { assertCan } from '@/domain/identity/role';
import type { Product, ProductStatus, ProductTranslation } from '@/domain/catalog/product';
import { DomainError } from '@/domain/shared/errors';
import { slugify } from '@/domain/shared/slug';
import type { EvaluateStockChanges } from '../inventory/evaluate-stock-changes';
import type { ProductRepository } from '../ports/catalog';
import type { Clock, IdGenerator } from '../ports/platform';

/** Dependencies of the product actions. */
export interface ProductActionsDeps {
  products: ProductRepository;
  evaluateStock: EvaluateStockChanges;
  ids: IdGenerator;
  clock: Clock;
}

/** Changes only the status of a product, so a quick toggle never rewrites stock. */
export class ChangeProductStatus {
  /** @param deps Repository and clock. */
  constructor(private readonly deps: Pick<ProductActionsDeps, 'products' | 'clock'>) {}

  /**
   * Sets the status.
   * @param actor The signed-in admin; needs the catalog permission.
   * @param id Product id.
   * @param status New status.
   * @throws DomainError FORBIDDEN, or NOT_FOUND for an unknown product.
   */
  async execute(actor: AdminUser, id: string, status: ProductStatus): Promise<void> {
    assertCan(actor.role, 'catalog.edit');
    if (!(await this.deps.products.findById(id))) throw new DomainError('NOT_FOUND', 'Product not found');
    await this.deps.products.setStatus(id, status, this.deps.clock.now().toISOString());
  }
}

/** Changes the status of several products at once, from the bulk bar of the admin list. Stock is never touched. */
export class ChangeProductStatuses {
  /** @param deps Repository and clock. */
  constructor(private readonly deps: Pick<ProductActionsDeps, 'products' | 'clock'>) {}

  /**
   * Sets the status of every product in the list.
   * @param actor The signed-in admin; needs the catalog permission.
   * @param ids Product ids; repeats are ignored.
   * @param status New status.
   * @throws DomainError FORBIDDEN.
   * @returns The ids that were changed. An unknown id is skipped, not an error: the list may be stale.
   */
  async execute(actor: AdminUser, ids: readonly string[], status: ProductStatus): Promise<string[]> {
    assertCan(actor.role, 'catalog.edit');
    const unique = [...new Set(ids)];
    return this.deps.products.setStatusMany(unique, status, this.deps.clock.now().toISOString());
  }
}

/** Copies a product as a draft. Variant ids are new and SKUs and barcodes are cleared, because SKUs must stay unique. */
export class DuplicateProduct {
  /** @param deps Repository, stock alert evaluation, ids and clock. */
  constructor(private readonly deps: ProductActionsDeps) {}

  /**
   * Makes the copy. Each variant starts with the stock of the original, recorded as an initial ledger change.
   * @param actor The signed-in admin who duplicates it; needs the catalog permission.
   * @param id Product to copy.
   * @returns The new product id.
   * @throws DomainError FORBIDDEN, or NOT_FOUND for an unknown product.
   */
  async execute(actor: AdminUser, id: string): Promise<{ id: string }> {
    assertCan(actor.role, 'catalog.edit');
    const actorId = actor.id;
    const source = await this.deps.products.findById(id);
    if (!source) throw new DomainError('NOT_FOUND', 'Product not found');
    const now = this.deps.clock.now().toISOString();
    const suffix = this.deps.ids.newId().slice(0, 6);
    const stockDeltas: Record<string, number> = {};
    const variants = source.variants.map((variant, position) => {
      const copyId = this.deps.ids.newId();
      if (variant.stock > 0) stockDeltas[copyId] = variant.stock;
      return { ...variant, id: copyId, sku: null, barcode: null, position, stock: 0 };
    });
    const copy: Product = {
      ...source,
      id: this.deps.ids.newId(),
      status: 'draft',
      translations: {
        es: copyTranslation(source.translations.es, suffix),
        en: copyTranslation(source.translations.en, suffix),
      },
      variants,
      createdAt: now,
      updatedAt: now,
    };
    const stockChanges = await this.deps.products.save(copy, { actorId, stockNote: null, stockDeltas });
    await this.deps.evaluateStock.execute(stockChanges);
    return { id: copy.id };
  }
}

/**
 * Gives a copied translation a unique slug. A language without a name stays empty.
 * @param text Original translation.
 * @param suffix Short random suffix that keeps the slug unique.
 * @returns The translation for the copy.
 */
function copyTranslation(text: ProductTranslation, suffix: string): ProductTranslation {
  if (!text.name) return text;
  return { ...text, slug: slugify(`${text.slug}-copy-${suffix}`) };
}
