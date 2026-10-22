// Structured data of the storefront pages, assembled from what each page already loaded.
// The generic schema.org builders live in structured-data.ts; this file knows which nodes each page carries.
import type { CategoryDto, ProductDetailDto } from '@/application/dto/catalog-dto';
import type { Locale } from '@/domain/shared/locale';
import { PATHS } from '@/domain/shared/paths';
import { mediaUrl } from './media-url';
import {
  breadcrumbNode,
  localBusinessNode,
  organizationNodes,
  productNode,
  type Crumb,
  type JsonLd,
} from './structured-data';

/** Values every page's structured data needs. */
interface SeoContext {
  origin: string;
  locale: Locale;
  storeName: string;
  /** Labels of the first breadcrumb steps, in the page language. */
  labels: { home: string; shop: string };
}

/**
 * Absolute URL of a path.
 * @param origin Public origin.
 * @param path Path that starts with "/".
 * @returns Absolute URL.
 */
function url(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

/**
 * Home page: the organization, the site search box and, when the store publishes an address, the local business.
 * @param context Origin, language and store name.
 * @param contact Public email and address from settings.
 * @returns Nodes for the home page.
 */
export function homeStructuredData(
  context: SeoContext,
  contact: { email: string; address: string },
): JsonLd[] {
  const siteUrl = url(context.origin, PATHS.home(context.locale));
  const nodes = organizationNodes({
    name: context.storeName,
    siteUrl,
    locale: context.locale,
    email: contact.email || undefined,
    searchUrlTemplate: `${url(context.origin, PATHS.shop(context.locale))}?q={search_term_string}`,
  });
  if (contact.address) {
    nodes.push(
      localBusinessNode({
        name: context.storeName,
        url: siteUrl,
        address: contact.address,
        email: contact.email || undefined,
      }),
    );
  }
  return nodes;
}

/**
 * Category page: the breadcrumb trail.
 * @param context Origin, language, store name and labels.
 * @param category The category shown.
 * @returns Nodes for the category page.
 */
export function categoryStructuredData(context: SeoContext, category: CategoryDto): JsonLd[] {
  return [
    breadcrumbNode(
      trail(context, [
        { name: category.name, url: url(context.origin, PATHS.category(context.locale, category.slug)) },
      ]),
    ),
  ];
}

/**
 * The shared start of every trail: home, then the shop.
 * @param context Origin, language and labels.
 * @param rest Steps after the shop.
 * @returns The full trail.
 */
function trail(context: SeoContext, rest: Crumb[]): Crumb[] {
  return [
    { name: context.labels.home, url: url(context.origin, PATHS.home(context.locale)) },
    { name: context.labels.shop, url: url(context.origin, PATHS.shop(context.locale)) },
    ...rest,
  ];
}

/**
 * Product page: the product with its offer, and the breadcrumb trail.
 * @param context Origin, language, store name and labels.
 * @param product The product shown.
 * @param money Store currency code and its decimals (the product DTO does not carry the currency).
 * @param description Plain-text description (the SEO description or the short description).
 * @returns Nodes for the product page.
 */
export function productStructuredData(
  context: SeoContext,
  product: ProductDetailDto,
  money: { currency: string; exponent: number },
  description: string,
): JsonLd[] {
  const active = product.variants.filter((variant) => variant.isActive);
  const prices = active.map((variant) => variant.priceMinor);
  const pageUrl = url(context.origin, PATHS.product(context.locale, product.slug));
  const category = product.categories[0];
  const crumbs: Crumb[] = category
    ? [{ name: category.name, url: url(context.origin, PATHS.category(context.locale, category.slug)) }]
    : [];
  return [
    productNode({
      name: product.name,
      description,
      imageUrls: product.images.map((image) => url(context.origin, mediaUrl(image.key))),
      sku: active.length === 1 ? active[0]?.sku : null,
      offer: {
        lowMinor: prices.length > 0 ? Math.min(...prices) : product.basePriceMinor,
        highMinor: prices.length > 0 ? Math.max(...prices) : product.basePriceMinor,
        currency: money.currency,
        exponent: money.exponent,
        inStock: active.some((variant) => !variant.trackInventory || variant.stock > 0),
        url: pageUrl,
      },
    }),
    breadcrumbNode(trail(context, [...crumbs, { name: product.name, url: pageUrl }])),
  ];
}
