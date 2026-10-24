// The product page read model: one active product with its images, categories, variants and the attributes they use.
import type { Locale } from '@/domain/shared/locale';
import type { AttributeFacetDto, ProductDetailDto } from '@/application/dto/catalog-dto';
import { cardImageKey, cardImageVariants, pickLabel } from './catalog-text';
import { loadProductVariants } from './catalog-variants';
import { queryFirst, statement } from './d1-client';

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

  // Everything below depends only on the product id, so it all goes out together: one batch for the small lookups and the
  // variants' own batch next to it, instead of a chain of reads.
  const [lookups, variants] = await Promise.all([
    db.batch([
      statement(db, 'SELECT locale, slug FROM product_translations WHERE product_id = ?', [product.id]),
      statement(
        db,
        'SELECT m.variants_json, m.alt_json FROM product_images pi JOIN media_assets m ON m.id = pi.media_id WHERE pi.product_id = ? ORDER BY pi.position',
        [product.id],
      ),
      statement(
        db,
        `SELECT c.id, ct.slug, ct.name, ct.description, c.image_media_id
         FROM product_categories pc JOIN categories c ON c.id = pc.category_id
         JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
         WHERE pc.product_id = ?`,
        [locale, product.id],
      ),
      attributeSummaryStatement(db, product.id),
    ]),
    loadProductVariants(db, product.id, locale),
  ]);
  const alternates = (lookups[0]?.results ?? []) as { locale: Locale; slug: string }[];
  const images = (lookups[1]?.results ?? []) as { variants_json: string; alt_json: string }[];
  const categories = (lookups[2]?.results ?? []) as {
    id: string;
    slug: string;
    name: string;
    description: string;
    image_media_id: string | null;
  }[];
  const attributeFacets = attributeSummaries((lookups[3]?.results ?? []) as SummaryRow[], locale);

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
        variants: cardImageVariants(image.variants_json),
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

/** Row of the attribute summary query. */
interface SummaryRow {
  av_id: string;
  label_json: string;
  color_hex: string | null;
  attribute_id: string;
  code: string;
  name_json: string;
  display: 'buttons' | 'swatches';
  position: number;
}

/**
 * Statement for the attribute values the active variants of a product use, in attribute order.
 * @param db D1 binding.
 * @param productId Product id.
 * @returns A statement that returns SummaryRow rows.
 */
function attributeSummaryStatement(db: D1Database, productId: string): D1PreparedStatement {
  return statement(
    db,
    `SELECT av.id AS av_id, av.label_json, av.color_hex, av.attribute_id, a.code, a.name_json, a.display, av.position
       FROM attribute_values av JOIN attributes a ON a.id = av.attribute_id
       WHERE av.id IN (SELECT vav.attribute_value_id FROM variant_attribute_values vav
                       JOIN product_variants v ON v.id = vav.variant_id
                       WHERE v.product_id = ? AND v.is_active = 1)
       ORDER BY a.position, av.position`,
    [productId],
  );
}

/**
 * Groups the attribute values a product uses by attribute, for product pages.
 * @param rows Rows of the summary statement.
 * @param locale Language.
 * @returns Facet-shaped summaries without counts.
 */
function attributeSummaries(rows: SummaryRow[], locale: Locale): AttributeFacetDto[] {
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
