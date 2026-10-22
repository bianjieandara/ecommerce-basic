// Builds sitemap.xml and robots.txt. Pure functions: the routes load the data and pass it in.
// Only URLs a search engine may index are listed: filtered shop URLs are noindex and never appear here.
import type { SitemapCatalogDto, SitemapEntryDto } from '@/application/dto/catalog-dto';
import { SUPPORTED_LOCALES, type Locale } from '@/domain/shared/locale';
import { PATHS } from '@/domain/shared/paths';
import { absoluteUrl } from '../documents/urls';

/** What the sitemap lists. */
export interface SitemapInput {
  /** Public origin, for example https://shop.example.com. */
  origin: string;
  /** Language search engines should pick for visitors with no match (the hreflang x-default). */
  defaultLocale: Locale;
  catalog: SitemapCatalogDto;
  /** Slugs of the published content pages other than home and contact, which have their own routes. */
  pageSlugs: string[];
}

/** One URL with its language alternates. */
interface UrlEntry {
  paths: Partial<Record<Locale, string>>;
  lastModified?: string;
}

/**
 * Escapes text for XML content and attribute values.
 * @param text Raw text.
 * @returns Text that is safe inside an XML element or attribute.
 */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Turns a catalog entry into URL entries.
 * @param entry Slugs per language and last change.
 * @param pathOf Path builder of the item type.
 * @returns One entry holding every language the item exists in.
 */
function catalogEntry(entry: SitemapEntryDto, pathOf: (locale: Locale, slug: string) => string): UrlEntry {
  const paths: UrlEntry['paths'] = {};
  for (const locale of SUPPORTED_LOCALES) {
    const slug = entry.slugs[locale];
    if (slug) paths[locale] = pathOf(locale, slug);
  }
  return { paths, lastModified: entry.updatedAt };
}

/**
 * Lists one URL per language, each with the full set of alternates (every URL must name all of them, itself included).
 * @param entry URL entry.
 * @param input Sitemap input.
 * @returns The `<url>` elements for the entry.
 */
function urlElements(entry: UrlEntry, input: SitemapInput): string {
  const available = SUPPORTED_LOCALES.filter((locale) => entry.paths[locale]);
  const alternates = available
    .map(
      (locale) =>
        `<xhtml:link rel="alternate" hreflang="${locale}" href="${escapeXml(absoluteUrl(input.origin, entry.paths[locale] ?? ''))}"/>`,
    )
    .concat(
      entry.paths[input.defaultLocale]
        ? [
            `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(absoluteUrl(input.origin, entry.paths[input.defaultLocale] ?? ''))}"/>`,
          ]
        : [],
    )
    .join('');
  return available
    .map((locale) => {
      const lastmod = entry.lastModified ? `<lastmod>${escapeXml(entry.lastModified)}</lastmod>` : '';
      return `<url><loc>${escapeXml(absoluteUrl(input.origin, entry.paths[locale] ?? ''))}</loc>${lastmod}${alternates}</url>`;
    })
    .join('');
}

/**
 * Builds sitemap.xml with hreflang alternates.
 * @param input Origin, default language, catalog slugs and page slugs.
 * @returns The XML document.
 */
export function buildSitemap(input: SitemapInput): string {
  const both = (pathOf: (locale: Locale) => string): UrlEntry => ({
    paths: Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, pathOf(locale)])),
  });
  const entries: UrlEntry[] = [
    both(PATHS.home),
    both(PATHS.shop),
    both(PATHS.contact),
    ...input.catalog.categories.map((entry) => catalogEntry(entry, PATHS.category)),
    ...input.catalog.products.map((entry) => catalogEntry(entry, PATHS.product)),
    ...input.pageSlugs.map((slug) => both((locale) => PATHS.page(locale, slug))),
  ];
  const body = entries.map((entry) => urlElements(entry, input)).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>\n`;
}

/**
 * Builds robots.txt. Private areas are closed to crawlers; filtered shop URLs stay crawlable on purpose, because a
 * crawler can only obey their `noindex` when it is allowed to fetch them.
 * @param origin Public origin, for the sitemap line.
 * @returns The robots.txt text.
 */
export function buildRobots(origin: string): string {
  return [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /*/checkout',
    'Disallow: /*/cart',
    'Disallow: /*/orders',
    '',
    `Sitemap: ${absoluteUrl(origin, '/sitemap.xml')}`,
    '',
  ].join('\n');
}
