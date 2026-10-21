// Storefront read model on D1: listings, facets, product detail and quote lookups.
// One WHERE builder is shared by listings, counts and facets, so every number on the page is computed the same way.
// Facet counts are disjunctive: each facet ignores its own selection, so the user can still switch to a sibling value.
import type { CatalogQuery } from '@/domain/catalog/catalog-query';
import type { Locale } from '@/domain/shared/locale';
import { toPaginated, type Paginated } from '@/domain/shared/pagination';
import type { CatalogQueryService } from '@/application/ports/catalog';
import type {
  AttributeFacetDto,
  CategoryDto,
  FacetsDto,
  FeedItemDto,
  ProductCardDto,
  ProductDetailDto,
  QuoteVariantDto,
  SearchSuggestionDto,
} from '@/application/dto/catalog-dto';
import { parseJson, queryAll, queryFirst, type SqlValue } from './d1-client';

/** One filter that a facet may ignore when it counts its own values. */
type Exclusion = 'search' | 'category' | 'price' | 'stock' | 'sale' | 'new' | { attributeId: string };

/** A SQL fragment with its bound values. */
interface Clause {
  sql: string;
  params: SqlValue[];
}

/** Options that come from store settings. */
export interface CatalogQueryOptions {
  /** Products created within this many days show the "new" badge. */
  newDays: number;
  /** Current time, injected for tests and the new-products cutoff. */
  now: () => Date;
}

/** Row of a product card query. */
interface CardRow {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  category_name: string | null;
  image_variants: string | null;
  second_image_variants: string | null;
  min_price_minor: number;
  max_price_minor: number;
  compare_at_price_minor: number | null;
  is_on_sale: number;
  created_at: string;
  variant_count: number;
  first_variant_id: string | null;
  in_stock: number;
}

/** Converts a search term to a safe FTS5 prefix query ("cami cla" -> "cami* cla*"). */
export function toPrefixQuery(term: string): string | null {
  const tokens = term
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.length === 0 ? null : tokens.map((token) => `${token}*`).join(' ');
}

/**
 * Picks the URL of the largest stored variant at or below 960 px, for cards.
 * @param json Stored variants JSON.
 * @returns Storage key or null.
 */
function cardImageKey(json: string | null): string | null {
  const variants = parseJson<{ width: number; key: string }[]>(json, []);
  const chosen = [...variants]
    .sort((a, b) => a.width - b.width)
    .filter((variant) => variant.width <= 960)
    .pop();
  return chosen?.key ?? variants[0]?.key ?? null;
}

/** D1 implementation of CatalogQueryService. */
export class D1CatalogQueryService implements CatalogQueryService {
  /**
   * @param db D1 database binding.
   * @param options Settings-derived options.
   */
  constructor(
    private readonly db: D1Database,
    private readonly options: CatalogQueryOptions,
  ) {}

  /**
   * Builds the WHERE clause for the query, skipping the exclusions (used by disjunctive facet counts).
   * @param query Normalized query.
   * @param valueAttribute Map from attribute value id to its attribute id.
   * @param exclude Filters to leave out.
   * @returns SQL fragment (always valid) and its parameters.
   */
  private where(query: CatalogQuery, valueAttribute: Map<string, string>, exclude: Exclusion[] = []): Clause {
    const skip = (key: Exclusion) => exclude.some((item) => JSON.stringify(item) === JSON.stringify(key));
    const parts: string[] = ["p.status = 'active'"];
    const params: SqlValue[] = [];

    if (query.q !== null && !skip('search')) {
      const prefix = toPrefixQuery(query.q);
      if (prefix) {
        parts.push(
          'p.id IN (SELECT product_id FROM product_search WHERE product_search MATCH ? AND locale = ?)',
        );
        params.push(prefix, query.locale);
      } else {
        parts.push('0');
      }
    }
    if (query.categorySlug !== null && !skip('category')) {
      parts.push(
        'p.id IN (SELECT pc.product_id FROM product_categories pc JOIN category_translations ct ON ct.category_id = pc.category_id AND ct.locale = ? WHERE ct.slug = ?)',
      );
      params.push(query.locale, query.categorySlug);
    }

    const groups = new Map<string, string[]>();
    for (const valueId of query.valueIds) {
      const attributeId = valueAttribute.get(valueId);
      if (!attributeId) {
        parts.push('0');
        continue;
      }
      groups.set(attributeId, [...(groups.get(attributeId) ?? []), valueId]);
    }
    for (const [attributeId, values] of groups) {
      if (skip({ attributeId })) continue;
      parts.push(
        `EXISTS (SELECT 1 FROM product_variants v JOIN variant_attribute_values vav ON vav.variant_id = v.id WHERE v.product_id = p.id AND vav.attribute_value_id IN (${values.map(() => '?').join(',')}))`,
      );
      params.push(...values);
    }

    if (query.minPriceMinor !== null && !skip('price')) {
      parts.push('p.min_price_minor >= ?');
      params.push(query.minPriceMinor);
    }
    if (query.maxPriceMinor !== null && !skip('price')) {
      parts.push('p.min_price_minor <= ?');
      params.push(query.maxPriceMinor);
    }
    if (query.inStock && !skip('stock')) {
      parts.push(
        'EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 AND (v.track_inventory = 0 OR v.stock > 0))',
      );
    }
    if (query.onSale && !skip('sale')) parts.push('p.is_on_sale = 1');
    if (query.isNew && !skip('new')) {
      parts.push('p.created_at >= ?');
      params.push(this.newCutoff());
    }
    return { sql: parts.join(' AND '), params };
  }

  /**
   * ORDER BY clause for a sort. Relevance falls back to newest, because FTS rank is not exposed here.
   * @param sort Sort name from the query.
   * @returns SQL ORDER BY expression.
   */
  private orderBy(sort: CatalogQuery['sort']): string {
    switch (sort) {
      case 'price_asc':
        return 'p.min_price_minor ASC, p.id';
      case 'price_desc':
        return 'p.min_price_minor DESC, p.id';
      case 'best_sellers':
        return 'p.sales_count DESC, p.id';
      case 'featured':
        return 'p.is_featured DESC, p.created_at DESC';
      case 'newest':
      case 'relevance':
        return 'p.created_at DESC, p.id';
    }
  }

  /** ISO timestamp before which products are no longer "new". */
  private newCutoff(): string {
    return new Date(this.options.now().getTime() - this.options.newDays * 86_400_000).toISOString();
  }

  /**
   * Maps attribute value ids to their attribute ids (needed to group filters per attribute).
   * @param valueIds Value ids from the query.
   * @returns Lookup map.
   */
  private async valueAttributes(valueIds: string[]): Promise<Map<string, string>> {
    if (valueIds.length === 0) return new Map();
    const rows = await queryAll<{ id: string; attribute_id: string }>(
      this.db,
      `SELECT id, attribute_id FROM attribute_values WHERE id IN (${valueIds.map(() => '?').join(',')})`,
      valueIds,
    );
    return new Map(rows.map((row) => [row.id, row.attribute_id]));
  }

  async listProducts(query: CatalogQuery, pageSize: number): Promise<Paginated<ProductCardDto>> {
    const valueAttribute = await this.valueAttributes(query.valueIds);
    const where = this.where(query, valueAttribute);
    const offset = (query.page - 1) * pageSize;
    const rows = await queryAll<CardRow>(
      this.db,
      `SELECT p.id, t.slug, t.name, t.short_description,
        (SELECT ct.name FROM product_categories pc JOIN category_translations ct ON ct.category_id = pc.category_id AND ct.locale = ? WHERE pc.product_id = p.id LIMIT 1) AS category_name,
        (SELECT m.variants_json FROM product_images pi JOIN media_assets m ON m.id = pi.media_id WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1) AS image_variants,
        (SELECT m.variants_json FROM product_images pi JOIN media_assets m ON m.id = pi.media_id WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1 OFFSET 1) AS second_image_variants,
        p.min_price_minor, p.max_price_minor, p.compare_at_price_minor, p.is_on_sale, p.created_at,
        (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_count,
        (SELECT v.id FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 LIMIT 1) AS first_variant_id,
        EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 AND (v.track_inventory = 0 OR v.stock > 0)) AS in_stock
       FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE ${where.sql}
       ORDER BY ${this.orderBy(query.sort)}
       LIMIT ? OFFSET ?`,
      [query.locale, query.locale, ...where.params, pageSize, offset],
    );
    const count = await queryFirst<{ n: number }>(
      this.db,
      `SELECT COUNT(*) AS n FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ? WHERE ${where.sql}`,
      [query.locale, ...where.params],
    );
    const items = rows.map((row) => this.toCard(row));
    return toPaginated(items, count?.n ?? 0, { page: query.page, pageSize });
  }

  /**
   * Maps a card row to the DTO.
   * @param row Query row.
   * @param locale Language of the card text.
   * @returns Product card.
   */
  private toCard(row: CardRow): ProductCardDto {
    const newCutoff = this.newCutoff();
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      shortDescription: row.short_description,
      categoryName: row.category_name ?? '',
      imageKey: cardImageKey(row.image_variants),
      secondImageKey: cardImageKey(row.second_image_variants),
      minPriceMinor: row.min_price_minor,
      maxPriceMinor: row.max_price_minor,
      compareAtPriceMinor: row.compare_at_price_minor,
      currency: '',
      isOnSale: row.is_on_sale === 1,
      isNew: row.created_at >= newCutoff,
      inStock: row.in_stock === 1,
      hasVariants: row.variant_count > 1,
      singleVariantId: row.variant_count === 1 ? row.first_variant_id : null,
    };
  }

  async countProducts(query: CatalogQuery): Promise<number> {
    const valueAttribute = await this.valueAttributes(query.valueIds);
    const where = this.where(query, valueAttribute);
    const row = await queryFirst<{ n: number }>(
      this.db,
      `SELECT COUNT(*) AS n FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ? WHERE ${where.sql}`,
      [query.locale, ...where.params],
    );
    return row?.n ?? 0;
  }

  async getFacets(query: CatalogQuery): Promise<FacetsDto> {
    const valueAttribute = await this.valueAttributes(query.valueIds);
    const base = (exclude: Exclusion[]) => this.where(query, valueAttribute, exclude);

    const categoryWhere = base(['category']);
    const categories = await queryAll<{ id: string; slug: string; name: string; n: number }>(
      this.db,
      `SELECT c.id, ct.slug, ct.name, COUNT(DISTINCT p.id) AS n
       FROM categories c
       JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
       JOIN product_categories pc ON pc.category_id = c.id
       JOIN products p ON p.id = pc.product_id
       JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE ${categoryWhere.sql}
       GROUP BY c.id ORDER BY c.position`,
      [query.locale, query.locale, ...categoryWhere.params],
    );

    const attributes = await this.attributeFacets(query, base);

    const priceWhere = base(['price']);
    const price = await queryFirst<{ lo: number | null; hi: number | null }>(
      this.db,
      `SELECT MIN(p.min_price_minor) AS lo, MAX(p.max_price_minor) AS hi
       FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE ${priceWhere.sql}`,
      [query.locale, ...priceWhere.params],
    );

    const flagWhere = base(['stock', 'sale', 'new']);
    const flags = await queryFirst<{ stock: number; sale: number; newc: number }>(
      this.db,
      `SELECT
         COUNT(CASE WHEN EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 AND (v.track_inventory = 0 OR v.stock > 0)) THEN 1 END) AS stock,
         COUNT(CASE WHEN p.is_on_sale = 1 THEN 1 END) AS sale,
         COUNT(CASE WHEN p.created_at >= ? THEN 1 END) AS newc
       FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE ${flagWhere.sql}`,
      [this.newCutoff(), query.locale, ...flagWhere.params],
    );

    return {
      categories: categories.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        count: row.n,
        selected: row.slug === query.categorySlug,
      })),
      attributes,
      price: { minMinor: price?.lo ?? 0, maxMinor: price?.hi ?? 0 },
      counts: { inStock: flags?.stock ?? 0, onSale: flags?.sale ?? 0, isNew: flags?.newc ?? 0 },
    };
  }

  /**
   * Builds the attribute facets. One query per filterable attribute, each ignoring that attribute's own selection.
   * @param query Normalized query.
   * @param valueAttribute Map from value id to attribute id.
   * @param base Factory for the WHERE clause with exclusions.
   * @returns Facets with counts.
   */
  private async attributeFacets(
    query: CatalogQuery,
    base: (exclude: Exclusion[]) => Clause,
  ): Promise<AttributeFacetDto[]> {
    const attributes = await queryAll<{
      id: string;
      code: string;
      name_json: string;
      display: 'buttons' | 'swatches';
    }>(
      this.db,
      'SELECT id, code, name_json, display FROM attributes WHERE is_filterable = 1 ORDER BY position',
    );
    const facets: AttributeFacetDto[] = [];
    for (const attribute of attributes) {
      const where = base([{ attributeId: attribute.id }]);
      const values = await queryAll<{ id: string; label_json: string; color_hex: string | null; n: number }>(
        this.db,
        `SELECT av.id, av.label_json, av.color_hex, COUNT(DISTINCT p.id) AS n
         FROM attribute_values av
         JOIN variant_attribute_values vav ON vav.attribute_value_id = av.id
         JOIN product_variants v ON v.id = vav.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
         WHERE av.attribute_id = ? AND ${where.sql}
         GROUP BY av.id ORDER BY av.position`,
        [query.locale, attribute.id, ...where.params],
      );
      facets.push({
        attributeId: attribute.id,
        code: attribute.code,
        label: pickLabel(attribute.name_json, query.locale),
        display: attribute.display,
        values: values.map((value) => ({
          id: value.id,
          label: pickLabel(value.label_json, query.locale),
          colorHex: value.color_hex,
          count: value.n,
          selected: query.valueIds.includes(value.id),
        })),
      });
    }
    return facets.filter((facet) => facet.values.length > 0);
  }

  async getProductBySlug(locale: Locale, slug: string): Promise<ProductDetailDto | null> {
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
      this.db,
      `SELECT p.id, p.base_price_minor, p.compare_at_price_minor, p.tax_rate_bp,
              t.name, t.short_description, t.description_md, t.seo_title, t.seo_description
       FROM product_translations t JOIN products p ON p.id = t.product_id
       WHERE t.locale = ? AND t.slug = ? AND p.status = 'active'`,
      [locale, slug],
    );
    if (!product) return null;

    const [alternates, images, categories, variants] = await Promise.all([
      queryAll<{ locale: Locale; slug: string }>(
        this.db,
        'SELECT locale, slug FROM product_translations WHERE product_id = ?',
        [product.id],
      ),
      queryAll<{ variants_json: string; alt_json: string }>(
        this.db,
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
        this.db,
        `SELECT c.id, ct.slug, ct.name, ct.description, c.image_media_id
         FROM product_categories pc JOIN categories c ON c.id = pc.category_id
         JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
         WHERE pc.product_id = ?`,
        [locale, product.id],
      ),
      this.quoteVariantsForProduct(product.id, locale),
    ]);

    const attributeIds = [...new Set(variants.flatMap((variant) => variant.attributeValueIds))];
    const attributeFacets = await this.attributeSummaries(attributeIds, locale);

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
   * @param productId Product id.
   * @param locale Language for labels.
   * @returns Variant DTOs.
   */
  private async quoteVariantsForProduct(productId: string, locale: Locale): Promise<QuoteVariantDto[]> {
    const ids = await queryAll<{ id: string }>(
      this.db,
      'SELECT id FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY position',
      [productId],
    );
    return this.getQuoteVariants(
      ids.map((row) => row.id),
      locale,
    );
  }

  /**
   * Attribute names and the values used by the given value ids, for product pages.
   * @param valueIds Attribute value ids in use.
   * @param locale Language.
   * @returns Facet-shaped summaries without counts.
   */
  private async attributeSummaries(valueIds: string[], locale: Locale): Promise<AttributeFacetDto[]> {
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
      this.db,
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

  async listCategories(locale: Locale): Promise<CategoryDto[]> {
    const rows = await queryAll<{
      id: string;
      slug: string;
      name: string;
      description: string;
      image_media_id: string | null;
    }>(
      this.db,
      `SELECT c.id, ct.slug, ct.name, ct.description, c.image_media_id
       FROM categories c JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
       WHERE c.is_active = 1 ORDER BY c.position`,
      [locale],
    );
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      imageKey: null,
    }));
  }

  async getCategoryBySlug(locale: Locale, slug: string): Promise<CategoryDto | null> {
    const row = await queryFirst<{ id: string; slug: string; name: string; description: string }>(
      this.db,
      `SELECT c.id, ct.slug, ct.name, ct.description
       FROM categories c JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
       WHERE c.is_active = 1 AND ct.slug = ?`,
      [locale, slug],
    );
    return row ? { ...row, imageKey: null } : null;
  }

  async suggest(locale: Locale, term: string, limit: number): Promise<SearchSuggestionDto[]> {
    const prefix = toPrefixQuery(term);
    if (!prefix) return [];
    return queryAll<SearchSuggestionDto>(
      this.db,
      `SELECT t.slug, t.name
       FROM product_search s
       JOIN product_translations t ON t.product_id = s.product_id AND t.locale = s.locale
       JOIN products p ON p.id = s.product_id
       WHERE product_search MATCH ? AND s.locale = ? AND p.status = 'active'
       LIMIT ?`,
      [prefix, locale, limit],
    );
  }

  async getQuoteVariants(variantIds: string[], locale: Locale): Promise<QuoteVariantDto[]> {
    if (variantIds.length === 0) return [];
    const rows = await queryAll<{
      id: string;
      product_id: string;
      sku: string | null;
      price_minor: number | null;
      compare_at_price_minor: number | null;
      stock: number;
      track_inventory: number;
      image_media_id: string | null;
      is_active: number;
      base_price_minor: number;
      tax_rate_bp: number | null;
      name: string;
      status: string;
    }>(
      this.db,
      `SELECT v.id, v.product_id, v.sku, v.price_minor, v.compare_at_price_minor, v.stock, v.track_inventory,
              v.image_media_id, v.is_active, p.base_price_minor, p.tax_rate_bp, p.status, t.name
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE v.id IN (${variantIds.map(() => '?').join(',')})`,
      [locale, ...variantIds],
    );
    const attributes = await this.variantAttributes(variantIds, locale);
    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.name,
      variantLabel: attributes.get(row.id)?.label ?? '',
      sku: row.sku,
      priceMinor: row.price_minor ?? row.base_price_minor,
      compareAtPriceMinor: row.compare_at_price_minor,
      taxRateBp: row.tax_rate_bp,
      stock: row.stock,
      trackInventory: row.track_inventory === 1,
      imageKey: null,
      attributeValueIds: attributes.get(row.id)?.valueIds ?? [],
      isActive: row.is_active === 1 && row.status === 'active',
    }));
  }

  /**
   * Labels such as "M / Red" and the attribute value ids of each variant, in attribute order.
   * @param variantIds Variant ids.
   * @param locale Language for the labels.
   * @returns Map from variant id to its label and value ids.
   */
  private async variantAttributes(
    variantIds: string[],
    locale: Locale,
  ): Promise<Map<string, { label: string; valueIds: string[] }>> {
    if (variantIds.length === 0) return new Map();
    const rows = await queryAll<{ variant_id: string; value_id: string; label_json: string }>(
      this.db,
      `SELECT vav.variant_id, av.id AS value_id, av.label_json
       FROM variant_attribute_values vav
       JOIN attribute_values av ON av.id = vav.attribute_value_id
       JOIN attributes a ON a.id = av.attribute_id
       WHERE vav.variant_id IN (${variantIds.map(() => '?').join(',')})
       ORDER BY a.position, av.position`,
      variantIds,
    );
    const grouped = new Map<string, { label: string; valueIds: string[] }>();
    for (const row of rows) {
      const entry = grouped.get(row.variant_id) ?? { label: '', valueIds: [] };
      const part = pickLabel(row.label_json, locale);
      entry.label = entry.label ? `${entry.label} / ${part}` : part;
      entry.valueIds.push(row.value_id);
      grouped.set(row.variant_id, entry);
    }
    return grouped;
  }
  async listProductsByIds(locale: Locale, ids: string[]): Promise<ProductCardDto[]> {
    if (ids.length === 0) return [];
    const where = `p.id IN (${ids.map(() => '?').join(',')}) AND p.status = 'active'`;
    const rows = await queryAll<CardRow>(
      this.db,
      `SELECT p.id, t.slug, t.name, t.short_description,
        (SELECT ct.name FROM product_categories pc JOIN category_translations ct ON ct.category_id = pc.category_id AND ct.locale = ? WHERE pc.product_id = p.id LIMIT 1) AS category_name,
        (SELECT m.variants_json FROM product_images pi JOIN media_assets m ON m.id = pi.media_id WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1) AS image_variants,
        NULL AS second_image_variants,
        p.min_price_minor, p.max_price_minor, p.compare_at_price_minor, p.is_on_sale, p.created_at,
        (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_count,
        (SELECT v.id FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 LIMIT 1) AS first_variant_id,
        EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 AND (v.track_inventory = 0 OR v.stock > 0)) AS in_stock
       FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE ${where}`,
      [locale, locale, ...ids],
    );
    const byId = new Map(rows.map((row) => [row.id, this.toCard(row)]));
    return ids.map((id) => byId.get(id)).filter((card): card is ProductCardDto => card !== undefined);
  }

  async listForFeed(locale: Locale): Promise<FeedItemDto[]> {
    const rows = await queryAll<{
      product_id: string;
      variant_id: string;
      slug: string;
      name: string;
      description: string;
      image_variants: string | null;
      price_minor: number | null;
      base_price_minor: number;
      compare_at_price_minor: number | null;
      in_stock: number;
      sku: string | null;
    }>(
      this.db,
      `SELECT p.id AS product_id, v.id AS variant_id, t.slug, t.name, t.short_description AS description,
        (SELECT m.variants_json FROM product_images pi JOIN media_assets m ON m.id = pi.media_id WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1) AS image_variants,
        v.price_minor, p.base_price_minor, COALESCE(v.compare_at_price_minor, p.compare_at_price_minor) AS compare_at_price_minor,
        (v.track_inventory = 0 OR v.stock > 0) AS in_stock, v.sku
       FROM product_variants v
       JOIN products p ON p.id = v.product_id AND p.status = 'active'
       JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
       WHERE v.is_active = 1`,
      [locale],
    );
    const attributes = await this.variantAttributes(
      rows.map((row) => row.variant_id),
      locale,
    );
    return rows.map((row) => ({
      productId: row.product_id,
      variantId: row.variant_id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      imageKey: cardImageKey(row.image_variants),
      priceMinor: row.price_minor ?? row.base_price_minor,
      compareAtPriceMinor: row.compare_at_price_minor,
      inStock: row.in_stock === 1,
      variantLabel: attributes.get(row.variant_id)?.label ?? '',
      sku: row.sku,
      color: null,
      size: null,
    }));
  }
}

/**
 * Picks the label for a locale from a stored LocalizedText JSON value, falling back to English then Spanish.
 * @param json Stored JSON, for example '{"es":"Negro","en":"Black"}'.
 * @param locale Requested language.
 * @returns Label text ("" when missing).
 */
export function pickLabel(json: string, locale: Locale): string {
  const value = parseJson<Partial<Record<Locale, string>>>(json, {});
  return value[locale] || value.en || value.es || '';
}
