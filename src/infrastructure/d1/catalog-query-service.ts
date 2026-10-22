// Storefront read model on D1: listings, counts, categories, search suggestions and the lookups that other parts reuse.
// The heavier reads live in their own files: filters (catalog-filters), facets, the product page, variants and the feed.
// One WHERE builder is shared by listings, counts and facets, so every number on the page is computed the same way.
import type { CatalogQuery } from '@/domain/catalog/catalog-query';
import type { Locale } from '@/domain/shared/locale';
import { toPaginated, type Paginated } from '@/domain/shared/pagination';
import type { CatalogQueryService } from '@/application/ports/catalog';
import type {
  CategoryDto,
  FacetsDto,
  FeedItemDto,
  ProductCardDto,
  ProductDetailDto,
  QuoteVariantDto,
  SearchSuggestionDto,
} from '@/application/dto/catalog-dto';
import { cardSelect, toCard, type CardRow } from './catalog-cards';
import { loadFacets } from './catalog-facets';
import { loadFeed } from './catalog-feed';
import { buildWhere, newCutoff, orderByFor, type CatalogQueryOptions } from './catalog-filters';
import { loadProductBySlug } from './catalog-product-detail';
import { toPrefixQuery } from './catalog-text';
import { loadQuoteVariants } from './catalog-variants';
import { queryAll, queryFirst } from './d1-client';

export type { CatalogQueryOptions } from './catalog-filters';

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
    const cutoff = newCutoff(this.options);
    const where = buildWhere(query, await this.valueAttributes(query.valueIds), cutoff);
    const offset = (query.page - 1) * pageSize;
    const rows = await queryAll<CardRow>(
      this.db,
      `${cardSelect(true)}
       WHERE ${where.sql}
       ORDER BY ${orderByFor(query.sort)}
       LIMIT ? OFFSET ?`,
      [query.locale, query.locale, ...where.params, pageSize, offset],
    );
    const count = await queryFirst<{ n: number }>(
      this.db,
      `SELECT COUNT(*) AS n FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ? WHERE ${where.sql}`,
      [query.locale, ...where.params],
    );
    const items = rows.map((row) => toCard(row, cutoff));
    return toPaginated(items, count?.n ?? 0, { page: query.page, pageSize });
  }

  async countProducts(query: CatalogQuery): Promise<number> {
    const where = buildWhere(query, await this.valueAttributes(query.valueIds), newCutoff(this.options));
    const row = await queryFirst<{ n: number }>(
      this.db,
      `SELECT COUNT(*) AS n FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ? WHERE ${where.sql}`,
      [query.locale, ...where.params],
    );
    return row?.n ?? 0;
  }

  async getFacets(query: CatalogQuery): Promise<FacetsDto> {
    return loadFacets(this.db, query, await this.valueAttributes(query.valueIds), newCutoff(this.options));
  }

  getProductBySlug(locale: Locale, slug: string): Promise<ProductDetailDto | null> {
    return loadProductBySlug(this.db, locale, slug);
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

  getQuoteVariants(variantIds: string[], locale: Locale): Promise<QuoteVariantDto[]> {
    return loadQuoteVariants(this.db, variantIds, locale);
  }

  async listProductsByIds(locale: Locale, ids: string[]): Promise<ProductCardDto[]> {
    if (ids.length === 0) return [];
    const cutoff = newCutoff(this.options);
    const rows = await queryAll<CardRow>(
      this.db,
      `${cardSelect(false)}
       WHERE p.id IN (${ids.map(() => '?').join(',')}) AND p.status = 'active'`,
      [locale, locale, ...ids],
    );
    const byId = new Map(rows.map((row) => [row.id, toCard(row, cutoff)]));
    return ids.map((id) => byId.get(id)).filter((card): card is ProductCardDto => card !== undefined);
  }

  listForFeed(locale: Locale): Promise<FeedItemDto[]> {
    return loadFeed(this.db, locale);
  }
}
