// UpsertProduct: checks every reference, turns the editor's stock values into ledger changes, and saves the whole product.
// The editor validates with the same schema before it posts, so a rejection here means a stale or hand-made request.
import {
  assertVariantsConsistent,
  type Product,
  type ProductTranslation,
  type ProductVariant,
} from '@/domain/catalog/product';
import { DomainError } from '@/domain/shared/errors';
import { slugify } from '@/domain/shared/slug';
import type { EvaluateStockChanges } from '../inventory/evaluate-stock-changes';
import type { ProductRepository } from '../ports/catalog';
import type { AttributeRepository, CategoryRepository } from '../ports/catalog-admin';
import type { SettingsRepository } from '../ports/content';
import type { MediaRepository } from '../ports/media';
import type { Clock, IdGenerator } from '../ports/platform';
import type { ProductInput, ProductTextInput } from './schemas';

/** Dependencies of UpsertProduct. */
export interface UpsertProductDeps {
  products: ProductRepository;
  categories: CategoryRepository;
  attributes: AttributeRepository;
  media: MediaRepository;
  settings: SettingsRepository;
  evaluateStock: EvaluateStockChanges;
  ids: IdGenerator;
  clock: Clock;
}

/** Creates or updates a product. */
export class UpsertProduct {
  /** @param deps Repositories, settings, ids and clock. */
  constructor(private readonly deps: UpsertProductDeps) {}

  /**
   * Saves a product. Stock is applied as a change from what the editor loaded, so a sale made in the meantime is kept.
   * @param input Validated product input.
   * @param actorId Admin who saves it; stored on the stock ledger.
   * @returns The product id.
   * @throws DomainError NOT_FOUND, VALIDATION_FAILED (broken rules or unknown references), CONFLICT (taken slug or SKU).
   */
  async execute(input: ProductInput, actorId: string): Promise<{ id: string }> {
    const now = this.deps.clock.now().toISOString();
    const existing = input.id ? await this.deps.products.findById(input.id) : null;
    if (input.id && !existing) throw new DomainError('NOT_FOUND', 'Product not found');
    await this.assertReferences(input);
    const knownVariants = new Set(existing?.variants.map((variant) => variant.id) ?? []);
    if (input.variants.some((variant) => variant.id !== null && !knownVariants.has(variant.id))) {
      throw new DomainError('VALIDATION_FAILED', 'A variant does not belong to this product');
    }

    const stockDeltas: Record<string, number> = {};
    const variants: ProductVariant[] = input.variants.map((variant, position) => {
      const id = variant.id ?? this.deps.ids.newId();
      const delta = stockDelta(variant);
      if (delta !== 0) stockDeltas[id] = delta;
      return {
        id,
        sku: variant.sku || null,
        barcode: variant.barcode || null,
        priceMinor: variant.priceMinor,
        compareAtPriceMinor: variant.compareAtPriceMinor,
        costMinor: variant.costMinor,
        stock: variant.stock,
        trackInventory: variant.trackInventory,
        lowStockThreshold: variant.lowStockThreshold,
        imageMediaId: variant.imageMediaId,
        position,
        isActive: variant.isActive,
        attributeValueIds: [...new Set(variant.attributeValueIds)],
      };
    });
    assertVariantsConsistent(variants);

    const translations = {
      es: toTranslation(input.translations.es),
      en: toTranslation(input.translations.en),
    };
    if (!translations.es.name && !translations.en.name) {
      throw new DomainError('VALIDATION_FAILED', 'Give the product a name in at least one language');
    }
    const product: Product = {
      id: input.id ?? this.deps.ids.newId(),
      status: input.status,
      basePriceMinor: input.basePriceMinor,
      compareAtPriceMinor: input.compareAtPriceMinor,
      taxRateBp: input.taxRateBp,
      isFeatured: input.isFeatured,
      translations,
      categoryIds: [...new Set(input.categoryIds)],
      imageIds: [...new Set(input.imageIds)],
      variants,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const inventory = await this.deps.settings.get('inventory');
    const stockChanges = await this.deps.products.save(product, {
      actorId,
      stockNote: input.stockNote,
      stockDeltas,
      defaultLowStockThreshold: inventory.defaultLowStockThreshold,
    });
    await this.deps.evaluateStock.execute(stockChanges);
    return { id: product.id };
  }

  /**
   * Checks that every category, image and attribute value the input names exists.
   * @param input Validated input.
   * @throws DomainError VALIDATION_FAILED for an unknown reference.
   */
  private async assertReferences(input: ProductInput): Promise<void> {
    const categoryIds = [...new Set(input.categoryIds)];
    const mediaIds = [
      ...new Set([
        ...input.imageIds,
        ...input.variants.flatMap((variant) => (variant.imageMediaId ? [variant.imageMediaId] : [])),
      ]),
    ];
    const valueIds = [...new Set(input.variants.flatMap((variant) => variant.attributeValueIds))];
    const [categories, media, values] = await Promise.all([
      this.deps.categories.existingIds(categoryIds),
      this.deps.media.findManyByIds(mediaIds),
      this.deps.attributes.existingValueIds(valueIds),
    ]);
    if (
      categories.length !== categoryIds.length ||
      media.length !== mediaIds.length ||
      values.length !== valueIds.length
    ) {
      throw new DomainError('VALIDATION_FAILED', 'A category, image or attribute value does not exist');
    }
  }
}

/**
 * The stock change the editor asks for: a new variant starts with its stock, a loaded one moves by the difference from
 * what was loaded, and a variant without a loaded value does not move.
 * @param variant Variant as validated.
 * @returns The change in units (0 for none).
 */
function stockDelta(variant: ProductInput['variants'][number]): number {
  if (variant.id === null) return variant.stock;
  if (variant.stockBefore === null) return 0;
  return variant.stock - variant.stockBefore;
}

/**
 * Turns one language of the editor into a stored translation. A language without a name keeps no text at all.
 * @param text Typed text.
 * @returns The translation, with the slug normalised and derived from the name when left empty.
 * @throws DomainError VALIDATION_FAILED when the name has no letters or digits to build a slug from.
 */
function toTranslation(text: ProductTextInput): ProductTranslation {
  if (!text.name) {
    return { name: '', slug: '', shortDescription: '', descriptionMd: '', seoTitle: '', seoDescription: '' };
  }
  const slug = slugify(text.slug || text.name);
  if (!slug) throw new DomainError('VALIDATION_FAILED', 'The name needs at least one letter or digit');
  return {
    name: text.name,
    slug,
    shortDescription: text.shortDescription,
    descriptionMd: text.descriptionMd,
    seoTitle: text.seoTitle,
    seoDescription: text.seoDescription,
  };
}
