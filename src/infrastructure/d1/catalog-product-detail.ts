// The product page read model: one active product with its images, categories, variants and the attributes they use.
import type { Locale } from '@/domain/shared/locale';
import type { AttributeFacetDto, ProductDetailDto, QuoteVariantDto } from '@/application/dto/catalog-dto';
import { cardImageKey, pickLabel } from './catalog-text';
import { loadQuoteVariants } from './catalog-variants';
import { queryAll, queryFirst } from './d1-client';

/**
 * Loads an active product by its slug in a language.
 * @param db D1 binding.
 * @param locale Language of the slug and the texts.
 * @param slug Product slug in that language.
 * @returns The product, or null when the slug is unknown or the product is not active.
 */
export async function loadProductBySlug(
  db: D1Database,
  locale: Locale,
  slug: string,
): Promise<ProductDetailDto | null> {
  const product = await queryFirst<{
    id: string;
    base_price_minor: number;
    compare_at_price_minor: number | null;
    tax_rate_bp: number | null;
    name: string;
    short_description: string;
    description_md: string;
    seo_title: string;
    seo_description: string;
  }>(
    db,
    `SELECT p.id, p.base_price_minor, p.compare_at_price_minor, p.tax_rate_bp,
              t.name, t.short_description, t.description_md, t.seo_title, t.seo_description
       FROM product_translations t JOIN products p ON p.id = t.product_id
       WHERE t.locale = ? AND t.slug = ? AND p.status = 'active'`,
    [locale, slug],
  );
  if (!product) return null;

  const [alternates, images, categories, variants] = await Promise.all([
    queryAll<{ locale: Locale; slug: string }>(
      db,
      'SELECT locale, slug FROM product_translations WHERE product_id = ?',
      [product.id],
    ),
    queryAll<{ variants_json: string; alt_json: string }>(
      db,
      'SELECT m.variants_json, m.alt_json FROM product_images pi JOIN media_assets m ON m.id = pi.media_id WHERE pi.product_id = ? ORDER BY pi.position',
      [product.id],
    ),
    queryAll<{
      id: string;
      slug: string;
      name: string;
      description: string;
      image_media_id: string | null;
    }>(
      db,
      `SELECT c.id, ct.slug, ct.name, ct.description, c.image_media_id
         FROM product_categories pc JOIN categories c ON c.id = pc.category_id
         JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
         WHERE pc.product_id = ?`,
      [locale, product.id],
    ),
    activeVariants(db, product.id, locale),
  ]);

  const attributeIds = [...new Set(variants.flatMap((variant) => variant.attributeValueIds))];
  const attributeFacets = await attributeSummaries(db, attributeIds, locale);

  const alternateSlugs: Partial<Record<Locale, string>> = {};
  for (const alternate of alternates) alternateSlugs[alternate.locale] = alternate.slug;

  return {
    id: product.id,
    slug,
    name: product.name,
    shortDescription: product.short_description,
    descriptionMd: product.description_md,
    locale,
    basePriceMinor: product.base_price_minor,
    compareAtPriceMinor: product.compare_at_price_minor,
    taxRateBp: product.tax_rate_bp,
    currency: '',
    images: images
      .map((image) => ({
        key: cardImageKey(image.variants_json) ?? '',
        alt: pickLabel(image.alt_json, locale),
      }))
      .filter((image) => image.key !== ''),
    categories: categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      imageKey: null,
    })),
    variants,
    attributes: attributeFacets,
    alternateSlugs,
    seoTitle: product.seo_title,
    seoDescription: product.seo_description,
  };
}

/**
 * Active variants of one product with prices and attribute labels.
 * @param db D1 binding.
 * @param productId Product id.
 * @param locale Language for labels.
 * @returns Variant DTOs.
 */
async function activeVariants(db: D1Database, productId: string, locale: Locale): Promise<QuoteVariantDto[]> {
  const ids = await queryAll<{ id: string }>(
    db,
    'SELECT id FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY position',
    [productId],
  );
  return loadQuoteVariants(
    db,
    ids.map((row) => row.id),
    locale,
  );
}

/**
 * Attribute names and the values used by the given value ids, for product pages.
 * @param db D1 binding.
 * @param valueIds Attribute value ids in use.
 * @param locale Language.
 * @returns Facet-shaped summaries without counts.
 */
async function attributeSummaries(
  db: D1Database,
  valueIds: string[],
  locale: Locale,
): Promise<AttributeFacetDto[]> {
  if (valueIds.length === 0) return [];
  const rows = await queryAll<{
    av_id: string;
    label_json: string;
    color_hex: string | null;
    attribute_id: string;
    code: string;
    name_json: string;
    display: 'buttons' | 'swatches';
    position: number;
  }>(
    db,
    `SELECT av.id AS av_id, av.label_json, av.color_hex, av.attribute_id, a.code, a.name_json, a.display, av.position
       FROM attribute_values av JOIN attributes a ON a.id = av.attribute_id
       WHERE av.id IN (${valueIds.map(() => '?').join(',')})
       ORDER BY a.position, av.position`,
    valueIds,
  );
  const byAttribute = new Map<string, AttributeFacetDto>();
  for (const row of rows) {
    const facet = byAttribute.get(row.attribute_id) ?? {
      attributeId: row.attribute_id,
      code: row.code,
      label: pickLabel(row.name_json, locale),
      display: row.display,
      values: [],
    };
    facet.values.push({
      id: row.av_id,
      label: pickLabel(row.label_json, locale),
      colorHex: row.color_hex,
      count: 0,
      selected: false,
    });
    byAttribute.set(row.attribute_id, facet);
  }
  return [...byAttribute.values()];
}
