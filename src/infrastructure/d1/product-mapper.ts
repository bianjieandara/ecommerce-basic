// Maps product rows from D1 to the domain aggregate, so the repository deals with SQL and the domain never sees a column.
import type { Product, ProductStatus, ProductTranslation, ProductVariant } from '@/domain/catalog/product';
import type { Locale } from '@/domain/shared/locale';

/** Row of products. */
export interface ProductRow {
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
export interface TranslationRow {
  locale: Locale;
  name: string;
  slug: string;
  short_description: string;
  description_md: string;
  seo_title: string;
  seo_description: string;
}

/** Row of product_variants. */
export interface VariantRow {
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

/**
 * Maps the rows of one product to the domain aggregate. A language without text keeps empty fields.
 * @param row Product row.
 * @param texts Translation rows.
 * @param categoryIds Category ids.
 * @param imageIds Image ids in display order.
 * @param variants Variants with their attribute values.
 * @returns The aggregate.
 */
export function toProduct(
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
export function toVariant(row: VariantRow, attributeValueIds: string[]): ProductVariant {
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
