// Schema.org JSON-LD builders for the storefront. Each returns a plain object; SeoHead serializes it.
// Google reviews are never marked up as the store's own aggregateRating (Google's guidelines forbid it).
import type { Locale } from '@/domain/shared/locale';

/** A JSON-LD node. */
export type JsonLd = Record<string, unknown>;

/** One step of a breadcrumb trail. */
export interface Crumb {
  name: string;
  /** Absolute URL. */
  url: string;
}

/** Offer data of a product, as the product page knows it. */
export interface ProductOffer {
  /** Lowest and highest price in minor units; equal when the product has one price. */
  lowMinor: number;
  highMinor: number;
  currency: string;
  /** Number of decimals of the currency (2 for USD, 0 for COP). */
  exponent: number;
  inStock: boolean;
  /** Absolute URL of the page. */
  url: string;
}

/**
 * Serializes JSON-LD for a script tag. "<" is escaped so a product name can never close the tag.
 * @param data One node or a list of nodes.
 * @returns JSON text that is safe inside a script element.
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, String.raw`<`);
}

/**
 * Price as the decimal text schema.org expects, built from minor units without floats.
 * @param minor Amount in minor units.
 * @param exponent Decimals of the currency.
 * @returns For example "12.50", or "1200" for a currency without decimals.
 */
function decimalText(minor: number, exponent: number): string {
  if (exponent === 0) return String(minor);
  const digits = String(minor).padStart(exponent + 1, '0');
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

/**
 * Organization and WebSite (with a search box) for the home page.
 * @param input Store name, absolute site URL, language, absolute logo URL and the shop search URL pattern.
 * @returns Two nodes.
 */
export function organizationNodes(input: {
  name: string;
  siteUrl: string;
  locale: Locale;
  logoUrl?: string;
  /** URL with the literal placeholder {search_term_string}. */
  searchUrlTemplate: string;
  email?: string;
}): JsonLd[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: input.name,
      url: input.siteUrl,
      ...(input.logoUrl ? { logo: input.logoUrl } : {}),
      ...(input.email ? { email: input.email } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: input.name,
      url: input.siteUrl,
      inLanguage: input.locale,
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: input.searchUrlTemplate },
        'query-input': 'required name=search_term_string',
      },
    },
  ];
}

/**
 * LocalBusiness for stores that publish a street address.
 * @param input Name, URL, address text and optional phone and email.
 * @returns One node.
 */
export function localBusinessNode(input: {
  name: string;
  url: string;
  address: string;
  telephone?: string;
  email?: string;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: input.name,
    url: input.url,
    address: input.address,
    ...(input.telephone ? { telephone: input.telephone } : {}),
    ...(input.email ? { email: input.email } : {}),
  };
}

/**
 * Breadcrumb trail.
 * @param crumbs Steps from the home page to the current page.
 * @returns One node.
 */
export function breadcrumbNode(crumbs: Crumb[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

/**
 * Product with an Offer (one price) or an AggregateOffer (a price range over its options).
 * @param input Product text, images and offer data.
 * @returns One node.
 */
export function productNode(input: {
  name: string;
  description: string;
  imageUrls: string[];
  sku?: string | null;
  offer: ProductOffer;
}): JsonLd {
  const { offer } = input;
  const availability = offer.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
  const priced =
    offer.lowMinor === offer.highMinor
      ? { '@type': 'Offer', price: decimalText(offer.lowMinor, offer.exponent) }
      : {
          '@type': 'AggregateOffer',
          lowPrice: decimalText(offer.lowMinor, offer.exponent),
          highPrice: decimalText(offer.highMinor, offer.exponent),
        };
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.imageUrls.length > 0 ? { image: input.imageUrls } : {}),
    ...(input.sku ? { sku: input.sku } : {}),
    offers: { ...priced, priceCurrency: offer.currency, availability, url: offer.url },
  };
}
