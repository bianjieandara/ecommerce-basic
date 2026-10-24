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
  SitemapCatalogDto,
} from '@/application/dto/catalog-dto';
import { cardSelect, toCard, type CardRow } from './catalog-cards';
import { loadFacets } from './catalog-facets';
import { cardImageKey } from './catalog-text';
import { loadFeed } from './catalog-feed';
import { loadSitemapCatalog } from './catalog-sitemap';
import {
  buildWhere,
  IN_STOCK_SQL,
  newCutoff,
  orderByFor,
  type CatalogQueryOptions,
  type Clause,
} from './catalog-filters';
import { loadProductBySlug } from './catalog-product-detail';
import { loadCategoryAlternates, loadRelatedCards } from './catalog-related';
import { toPrefixQuery } from './catalog-text';
import { loadQuoteVariants } from './catalog-variants';
import { queryAll, queryFirst, statement } from './d1-client';

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

  /** True when the store hides products that cannot be bought from its lists. */
  private hidesOutOfStock(): boolean {
    return this.options.showOutOfStock === 'hide';
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
      'SELECT id, attribute_id FROM attribute_values WHERE id IN (SELECT value FROM json_each(?))',
      [JSON.stringify(valueIds)],
    );
    return new Map(rows.map((row) => [row.id, row.attribute_id]));
  }

  /**
   * The statement that loads one page of cards. The page's ids are chosen first, from the filter and the sort alone, and only
   * those products get their card subqueries (pictures, category, variants). Sorting every match with the card columns
   * computed (the "out of stock last" order does this) cost 10 times more at 5,000 products.
   * @param query Normalized query.
   * @param where Filter from buildWhere.
   * @param limit Cards in the page.
   * @param offset Cards to skip.
   * @returns A statement that returns CardRow rows.
   */
  private pageStatement(
    query: CatalogQuery,
    where: Clause,
    limit: number,
    offset: number,
  ): D1PreparedStatement {
    const order = orderByFor(query.sort, this.options.showOutOfStock === 'last');
    return statement(
      this.db,
      `WITH page AS (
         SELECT p.id FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ?
         WHERE ${where.sql}
         ORDER BY ${order}
         LIMIT ? OFFSET ?)
       ${cardSelect(true)}
       WHERE p.id IN (SELECT id FROM page)
       ORDER BY ${order}`,
      [query.locale, ...where.params, limit, offset, query.locale, query.locale],
    );
  }

  /**
   * The statement that counts the products a query matches.
   * @param query Normalized query.
   * @param where Filter from buildWhere.
   * @returns A statement that returns one row with `n`.
   */
  private countStatement(query: CatalogQuery, where: Clause): D1PreparedStatement {
    return statement(
      this.db,
      `SELECT COUNT(*) AS n FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = ? WHERE ${where.sql}`,
      [query.locale, ...where.params],
    );
  }

  /**
   * The filter of a query, with the attribute lookup it needs.
   * @param query Normalized query.
   * @param cutoff Start of the "new" window.
   * @returns The WHERE clause and its binds.
   */
  private async filterOf(query: CatalogQuery, cutoff: string): Promise<Clause> {
    return buildWhere(query, await this.valueAttributes(query.valueIds), cutoff, [], this.hidesOutOfStock());
  }

  async listProducts(query: CatalogQuery, pageSize: number): Promise<Paginated<ProductCardDto>> {
    const cutoff = newCutoff(this.options);
    const where = await this.filterOf(query, cutoff);
    // The page and the total are independent, so they go out in one round trip.
    const [rows, count] = await this.db.batch([
      this.pageStatement(query, where, pageSize, (query.page - 1) * pageSize),
      this.countStatement(query, where),
    ]);
    const items = ((rows?.results ?? []) as CardRow[]).map((row) => toCard(row, cutoff));
    const total = ((count?.results?.[0] ?? null) as { n: number } | null)?.n ?? 0;
    return toPaginated(items, total, { page: query.page, pageSize });
  }

  async listTopProducts(query: CatalogQuery, limit: number): Promise<ProductCardDto[]> {
    const cutoff = newCutoff(this.options);
    const where = await this.filterOf(query, cutoff);
    const { results } = await this.pageStatement(query, where, limit, 0).all<CardRow>();
    return results.map((row) => toCard(row, cutoff));
  }

  async countProducts(query: CatalogQuery): Promise<number> {
    const where = await this.filterOf(query, newCutoff(this.options));
    const row = await this.countStatement(query, where).first<{ n: number }>();
    return row?.n ?? 0;
  }

  async getFacets(query: CatalogQuery): Promise<FacetsDto> {
    return loadFacets(
      this.db,
      query,
      await this.valueAttributes(query.valueIds),
      newCutoff(this.options),
      this.hidesOutOfStock(),
    );
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
      image_variants: string | null;
    }>(
      this.db,
      `SELECT c.id, ct.slug, ct.name, ct.description, m.variants_json AS image_variants
       FROM categories c JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
       LEFT JOIN media_assets m ON m.id = c.image_media_id
       WHERE c.is_active = 1 ORDER BY c.position`,
      [locale],
    );
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      imageKey: cardImageKey(row.image_variants),
    }));
  }

  async getCategoryBySlug(locale: Locale, slug: string): Promise<CategoryDto | null> {
    const row = await queryFirst<{
      id: string;
      slug: string;
      name: string;
      description: string;
      image_variants: string | null;
    }>(
      this.db,
      `SELECT c.id, ct.slug, ct.name, ct.description, m.variants_json AS image_variants
       FROM categories c JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
       LEFT JOIN media_assets m ON m.id = c.image_media_id
       WHERE c.is_active = 1 AND ct.slug = ?`,
      [locale, slug],
    );
    return row
      ? {
          id: row.id,
          slug: row.slug,
          name: row.name,
          description: row.description,
          imageKey: cardImageKey(row.image_variants),
        }
      : null;
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
       WHERE product_search MATCH ? AND s.locale = ? AND p.status = 'active'${this.hidesOutOfStock() ? ` AND ${IN_STOCK_SQL}` : ''}
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
       WHERE p.id IN (SELECT value FROM json_each(?)) AND p.status = 'active'`,
      [locale, locale, JSON.stringify(ids)],
    );
    const byId = new Map(rows.map((row) => [row.id, toCard(row, cutoff)]));
    return ids.map((id) => byId.get(id)).filter((card): card is ProductCardDto => card !== undefined);
  }

  async listRelatedProducts(locale: Locale, productId: string, limit: number): Promise<ProductCardDto[]> {
    const cutoff = newCutoff(this.options);
    const cards = (await loadRelatedCards(this.db, productId, locale, limit)).map((row) =>
      toCard(row, cutoff),
    );
    return this.hidesOutOfStock() ? cards.filter((card) => card.inStock) : cards;
  }

  getCategoryAlternates(locale: Locale, slug: string): Promise<Partial<Record<Locale, string>>> {
    return loadCategoryAlternates(this.db, locale, slug);
  }

  listForFeed(locale: Locale): Promise<FeedItemDto[]> {
    return loadFeed(this.db, locale);
  }

  listSitemapCatalog(): Promise<SitemapCatalogDto> {
    return loadSitemapCatalog(this.db);
  }
}
