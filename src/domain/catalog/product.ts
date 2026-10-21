// Product aggregate: a product with translations, categories, images and variants.
// Rules here keep prices and variant combinations consistent before anything is saved.
import { DomainError } from '../shared/errors';
import type { Locale } from '../shared/locale';

/** Visibility of a product in the storefront. Only "active" products are sold. */
export type ProductStatus = 'draft' | 'active' | 'archived';

/** Text of a product in one language. */
export interface ProductTranslation {
  name: string;
  slug: string;
  shortDescription: string;
  descriptionMd: string;
  seoTitle: string;
  seoDescription: string;
}

/** The sellable unit. A simple product has one variant with no attribute values. */
export interface ProductVariant {
  id: string;
  sku: string | null;
  barcode: string | null;
  /** Null means "use the product base price". */
  priceMinor: number | null;
  compareAtPriceMinor: number | null;
  costMinor: number | null;
  stock: number;
  trackInventory: boolean;
  /** Null means "use the store default". */
  lowStockThreshold: number | null;
  imageMediaId: string | null;
  position: number;
  isActive: boolean;
  /** Attribute value ids, one per attribute the product uses (for example one Size and one Color). */
  attributeValueIds: string[];
}

/** The product aggregate as the domain sees it. */
export interface Product {
  id: string;
  status: ProductStatus;
  basePriceMinor: number;
  compareAtPriceMinor: number | null;
  /** Null means "use the store tax rate"; 0 means tax exempt. */
  taxRateBp: number | null;
  isFeatured: boolean;
  translations: Record<Locale, ProductTranslation>;
  categoryIds: string[];
  imageIds: string[];
  variants: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}

/** Limits that keep variant matrices manageable for the admin and for the storefront filters. */
export const MAX_VARIANTS_PER_PRODUCT = 100;
export const MAX_ATTRIBUTES_PER_PRODUCT = 3;

/**
 * Price of one variant: its own price when set, otherwise the product base price.
 * @param variant Variant to price.
 * @param product Parent product (for the base price).
 * @returns Price in minor units.
 */
export function effectivePriceMinor(
  variant: ProductVariant,
  product: Pick<Product, 'basePriceMinor'>,
): number {
  return variant.priceMinor ?? product.basePriceMinor;
}

/**
 * Cheapest and most expensive active variant prices, stored on the product for listings and price filters.
 * A product without active variants is priced at its base price.
 * @param product Product to price.
 * @returns Minimum and maximum price in minor units.
 */
export function computePriceRange(product: Product): { minPriceMinor: number; maxPriceMinor: number } {
  const prices = product.variants
    .filter((variant) => variant.isActive)
    .map((variant) => effectivePriceMinor(variant, product));
  if (prices.length === 0)
    return { minPriceMinor: product.basePriceMinor, maxPriceMinor: product.basePriceMinor };
  return { minPriceMinor: Math.min(...prices), maxPriceMinor: Math.max(...prices) };
}

/**
 * True when at least one active variant is priced below its compare-at price.
 * @param product Product to check.
 * @returns Whether the product is on sale.
 */
export function computeIsOnSale(product: Product): boolean {
  return product.variants.some((variant) => {
    if (!variant.isActive) return false;
    const compareAt = variant.compareAtPriceMinor ?? product.compareAtPriceMinor;
    return compareAt !== null && compareAt > effectivePriceMinor(variant, product);
  });
}

/**
 * Validates the variant matrix before saving.
 * Rules: at least one variant; at most 100; a variant with no attributes must be the only one; at most 3 attributes
 * per variant; every attribute combination is unique.
 * @param variants Variants to validate.
 * @throws DomainError VALIDATION_FAILED describing the first broken rule.
 */
export function assertVariantsConsistent(variants: ProductVariant[]): void {
  if (variants.length === 0)
    throw new DomainError('VALIDATION_FAILED', 'A product needs at least one variant');
  if (variants.length > MAX_VARIANTS_PER_PRODUCT) {
    throw new DomainError('VALIDATION_FAILED', `At most ${MAX_VARIANTS_PER_PRODUCT} variants per product`);
  }
  const combinations = new Set<string>();
  for (const variant of variants) {
    if (variant.attributeValueIds.length > MAX_ATTRIBUTES_PER_PRODUCT) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `At most ${MAX_ATTRIBUTES_PER_PRODUCT} attributes per product`,
      );
    }
    if (variant.attributeValueIds.length === 0 && variants.length > 1) {
      throw new DomainError('VALIDATION_FAILED', 'A variant without attributes must be the only variant');
    }
    const key = [...variant.attributeValueIds].sort().join('|');
    if (combinations.has(key)) throw new DomainError('VALIDATION_FAILED', 'Duplicate variant combination');
    combinations.add(key);
  }
}

/**
 * Human label for a variant, built from the localized value labels: "M / Red".
 * @param valueLabels Labels in the order of the attributes.
 * @returns Joined label, or "" for a simple product.
 */
export function variantLabel(valueLabels: string[]): string {
  return valueLabels.join(' / ');
}
