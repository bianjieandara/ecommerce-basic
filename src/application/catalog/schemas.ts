// Admin catalog inputs. The product editor validates with these same schemas before it posts, and the endpoints validate
// again, so the two can never disagree about what a valid product is.
import { z } from 'zod';
import { MAX_ATTRIBUTES_PER_PRODUCT, MAX_VARIANTS_PER_PRODUCT } from '@/domain/catalog/product';

const id = z.string().min(1).max(64);
const minorAmount = z.number().int().min(0).max(1_000_000_000);
const stockCount = z.number().int().min(0).max(1_000_000);
const attributeCode = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{0,39}$/, 'Use lowercase letters, digits and dashes');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a color like #1a2b3c');

/** Text of one language for a label (attribute or value name). */
const localizedLabel = (max: number) =>
  z.object({
    es: z.string().trim().max(max).default(''),
    en: z.string().trim().max(max).default(''),
  });

/** Product text in one language. An empty name means the product has no text in that language. */
export const productTextInput = z.object({
  name: z.string().trim().max(200).default(''),
  slug: z.string().trim().max(80).default(''),
  shortDescription: z.string().trim().max(300).default(''),
  descriptionMd: z.string().max(20000).default(''),
  seoTitle: z.string().trim().max(160).default(''),
  seoDescription: z.string().trim().max(320).default(''),
});

/**
 * One variant. A null id is a new variant. `stock` is what the editor wants; `stockBefore` is what it loaded, and only a
 * difference from it becomes a stock change, so a sale that happened meanwhile is not undone.
 */
export const variantInput = z.object({
  id: id.nullable().default(null),
  sku: z.string().trim().max(64).nullable().default(null),
  barcode: z.string().trim().max(64).nullable().default(null),
  priceMinor: minorAmount.nullable().default(null),
  compareAtPriceMinor: minorAmount.nullable().default(null),
  costMinor: minorAmount.nullable().default(null),
  stock: stockCount.default(0),
  stockBefore: stockCount.nullable().default(null),
  trackInventory: z.boolean().default(true),
  lowStockThreshold: z.number().int().min(0).max(100_000).nullable().default(null),
  imageMediaId: id.nullable().default(null),
  isActive: z.boolean().default(true),
  attributeValueIds: z.array(id).max(MAX_ATTRIBUTES_PER_PRODUCT).default([]),
});

/** A product with its text, prices, categories, images and variants. */
export const productInput = z.object({
  id: id.nullable().default(null),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  basePriceMinor: minorAmount,
  compareAtPriceMinor: minorAmount.nullable().default(null),
  taxRateBp: z.number().int().min(0).max(10000).nullable().default(null),
  isFeatured: z.boolean().default(false),
  translations: z.object({ es: productTextInput, en: productTextInput }),
  categoryIds: z.array(id).max(20).default([]),
  imageIds: z.array(id).max(30).default([]),
  variants: z.array(variantInput).min(1).max(MAX_VARIANTS_PER_PRODUCT),
  /** Note stored with every manual stock change of this save. */
  stockNote: z.string().trim().max(200).nullable().default(null),
});

/** Text of a category in one language. */
export const categoryTextInput = z.object({
  name: z.string().trim().max(120).default(''),
  slug: z.string().trim().max(80).default(''),
  description: z.string().trim().max(2000).default(''),
});

/** A category: parent, image, visibility and text per language. */
export const categoryInput = z.object({
  id: id.nullable().default(null),
  parentId: id.nullable().default(null),
  imageMediaId: id.nullable().default(null),
  isActive: z.boolean().default(true),
  position: z.number().int().min(0).max(100_000).nullable().default(null),
  translations: z.object({ es: categoryTextInput, en: categoryTextInput }),
});

/** One value of an attribute. */
export const attributeValueInput = z.object({
  id: id.nullable().default(null),
  code: attributeCode,
  label: localizedLabel(80),
  colorHex: hexColor.nullable().default(null),
});

/** An attribute with its values, in the order they should appear. */
export const attributeInput = z.object({
  id: id.nullable().default(null),
  code: attributeCode,
  name: localizedLabel(80),
  display: z.enum(['buttons', 'swatches']).default('buttons'),
  isFilterable: z.boolean().default(true),
  position: z.number().int().min(0).max(1000).default(0),
  values: z.array(attributeValueInput).min(1).max(60),
});

/** Reference to one record by id. */
export const idInput = z.object({ id });

/** Quick status change of a product. */
export const productStatusInput = z.object({
  id,
  status: z.enum(['draft', 'active', 'archived']),
});

/** New order of a list of ids (categories). */
export const reorderInput = z.object({ ids: z.array(id).min(1).max(500) });

export type ProductInput = z.infer<typeof productInput>;
export type ProductTextInput = z.infer<typeof productTextInput>;
export type CategoryInput = z.infer<typeof categoryInput>;
export type AttributeInput = z.infer<typeof attributeInput>;
