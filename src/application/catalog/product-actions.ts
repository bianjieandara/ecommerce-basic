// Product actions from the admin list: a status change that never touches stock, and a duplicate that starts as a draft.
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
   * @param id Product id.
   * @param status New status.
   * @throws DomainError NOT_FOUND for an unknown product.
   */
  async execute(id: string, status: ProductStatus): Promise<void> {
    if (!(await this.deps.products.findById(id))) throw new DomainError('NOT_FOUND', 'Product not found');
    await this.deps.products.setStatus(id, status, this.deps.clock.now().toISOString());
  }
}

/** Copies a product as a draft. Variant ids are new and SKUs and barcodes are cleared, because SKUs must stay unique. */
export class DuplicateProduct {
  /** @param deps Repository, stock alert evaluation, ids and clock. */
  constructor(private readonly deps: ProductActionsDeps) {}

  /**
   * Makes the copy. Each variant starts with the stock of the original, recorded as an initial ledger change.
   * @param id Product to copy.
   * @param actorId Admin who duplicates it.
   * @returns The new product id.
   * @throws DomainError NOT_FOUND for an unknown product.
   */
  async execute(id: string, actorId: string): Promise<{ id: string }> {
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
