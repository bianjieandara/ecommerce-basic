// Catalog ports. The read side returns DTOs (query service); the write side saves domain aggregates (repositories).
import type { CatalogQuery } from '@/domain/catalog/catalog-query';
import type { Product } from '@/domain/catalog/product';
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
  listForFeed(locale: Locale): Promise<FeedItemDto[]>;
}

/** Write side: product aggregate persistence. */
export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  /**
   * Saves the aggregate in one batch: product, translations, categories, images, variants, attribute values,
   * search rows and denormalized prices. Stock changes are recorded in the ledger in the same batch.
   * Returns the stock changes so callers can evaluate alerts.
   */
  save(product: Product, actorId: string): Promise<StockChange[]>;
  delete(id: string): Promise<void>;
}
