// Storefront read models. Query services return these, so pages never see raw database rows.
import type { Locale } from '@/domain/shared/locale';

/** A product in listings and carousels. */
export interface ProductCardDto {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  categoryName: string;
  imageKey: string | null;
  secondImageKey: string | null;
  minPriceMinor: number;
  maxPriceMinor: number;
  compareAtPriceMinor: number | null;
  currency: string;
  isOnSale: boolean;
  isNew: boolean;
  inStock: boolean;
  hasVariants: boolean;
  /** Single variant id for quick add; null when the product has several variants. */
  singleVariantId: string | null;
}

/** One attribute value, with the count of products that match it in the current result set. */
export interface FacetValueDto {
  id: string;
  label: string;
  colorHex: string | null;
  count: number;
  selected: boolean;
}

/** One attribute facet (Size, Color...). */
export interface AttributeFacetDto {
  attributeId: string;
  code: string;
  label: string;
  display: 'buttons' | 'swatches';
  values: FacetValueDto[];
}

/** All facets for the filter panel. Counts are disjunctive: each facet ignores its own selection. */
export interface FacetsDto {
  categories: { id: string; slug: string; name: string; count: number; selected: boolean }[];
  attributes: AttributeFacetDto[];
  price: { minMinor: number; maxMinor: number };
  counts: { inStock: number; onSale: number; isNew: number };
}

/** A category in navigation and grids. */
export interface CategoryDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageKey: string | null;
}

/** A product suggestion in the search box. */
export interface SearchSuggestionDto {
  slug: string;
  name: string;
}

/** Product detail for the product page. */
export interface ProductDetailDto {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  descriptionMd: string;
  locale: Locale;
  basePriceMinor: number;
  compareAtPriceMinor: number | null;
  taxRateBp: number | null;
  currency: string;
  images: { key: string; alt: string }[];
  categories: CategoryDto[];
  variants: QuoteVariantDto[];
  attributes: AttributeFacetDto[];
  alternateSlugs: Partial<Record<Locale, string>>;
  seoTitle: string;
  seoDescription: string;
}

/** A variant as the storefront sees it (also used to re-price the cart on the server). */
export interface QuoteVariantDto {
  id: string;
  productId: string;
  productName: string;
  variantLabel: string;
  sku: string | null;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  taxRateBp: number | null;
  costMinor: number | null;
  stock: number;
  trackInventory: boolean;
  imageKey: string | null;
  attributeValueIds: string[];
  isActive: boolean;
}

/** One product row in the product feed (one row per active variant). */
export interface FeedItemDto {
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  description: string;
  imageKey: string | null;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  inStock: boolean;
  variantLabel: string;
  sku: string | null;
  color: string | null;
  size: string | null;
}

/** One sitemap row: the slug in every language that has one, and when the item last changed (ISO timestamp). */
export interface SitemapEntryDto {
  slugs: Partial<Record<Locale, string>>;
  updatedAt: string;
}

/** The catalog URLs a search engine may index: active products and active categories. */
export interface SitemapCatalogDto {
  products: SitemapEntryDto[];
  categories: SitemapEntryDto[];
}
