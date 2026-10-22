// Catalog ports. The read side returns DTOs (query service); the write side saves domain aggregates (repositories).
import type { CatalogQuery } from '@/domain/catalog/catalog-query';
import type { Product, ProductStatus } from '@/domain/catalog/product';
import type { Locale } from '@/domain/shared/locale';
import type { Paginated } from '@/domain/shared/pagination';
import type { StockChange } from './inventory';
import type {
  CategoryDto,
  FacetsDto,
  FeedItemDto,
  ProductCardDto,
  ProductDetailDto,
  QuoteVariantDto,
  SearchSuggestionDto,
  SitemapCatalogDto,
} from '../dto/catalog-dto';

/** Storefront read model for listings, search, product pages and feeds. */
export interface CatalogQueryService {
  listProducts(query: CatalogQuery, pageSize: number): Promise<Paginated<ProductCardDto>>;
  /** Number of products matching the query (used by the live result counter). */
  countProducts(query: CatalogQuery): Promise<number>;
  /** Facets with disjunctive counts: each facet ignores its own selection. */
  getFacets(query: CatalogQuery): Promise<FacetsDto>;
  getProductBySlug(locale: Locale, slug: string): Promise<ProductDetailDto | null>;
  listCategories(locale: Locale): Promise<CategoryDto[]>;
  getCategoryBySlug(locale: Locale, slug: string): Promise<CategoryDto | null>;
  suggest(locale: Locale, term: string, limit: number): Promise<SearchSuggestionDto[]>;
  /** Variants by id, used to re-price a cart on the server. The only trusted price source. */
  getQuoteVariants(variantIds: string[], locale: Locale): Promise<QuoteVariantDto[]>;
  listProductsByIds(locale: Locale, ids: string[]): Promise<ProductCardDto[]>;
  /** Cards of active products that share a category with a product, best matches first. Never includes the product itself. */
  listRelatedProducts(locale: Locale, productId: string, limit: number): Promise<ProductCardDto[]>;
  /** Slug of a category in every language that has one, for the language switch on category pages. */
  getCategoryAlternates(categoryId: string): Promise<Partial<Record<Locale, string>>>;
  listForFeed(locale: Locale): Promise<FeedItemDto[]>;
  /** Slugs and last change of every active product and category, for the sitemap. */
  listSitemapCatalog(): Promise<SitemapCatalogDto>;
}

/** What a product save needs besides the aggregate: who makes the change, and the stock movements it causes. */
export interface ProductSaveContext {
  actorId: string;
  /** Optional note stored with every manual stock movement of this save. */
  stockNote: string | null;
  /** Stock change per variant id. A new variant starts at 0, so its delta is its first stock. */
  stockDeltas: Record<string, number>;
}

/** Write side: product aggregate persistence. */
export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  /**
   * Saves the aggregate in one batch: product, translations, categories, images, variants, attribute values, search
   * rows and denormalized prices. Stock changes go to the ledger in the same batch. Variants that left the list are
   * deactivated, not deleted, so their stock history stays intact. Returns the stock changes for alert checks.
   */
  save(product: Product, context: ProductSaveContext): Promise<StockChange[]>;
  /** Changes only the status, so a quick toggle never rewrites stock. */
  setStatus(id: string, status: ProductStatus, nowIso: string): Promise<void>;
  delete(id: string): Promise<void>;
}
