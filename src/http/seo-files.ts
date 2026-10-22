// Responses for sitemap.xml and robots.txt: loads what the pure builders in application/seo need and sets the headers.
import type { Container } from '@/composition/create-container';
import { DEFAULT_SYSTEM_PAGES } from '@/application/content/defaults/system-pages';
import { buildRobots, buildSitemap } from '@/application/seo/sitemap';
import { SYSTEM_PAGE_SLUGS } from '@/domain/content/page';

/** Pages that have their own route, so they are listed by the sitemap builder and not as content pages. */
const OWN_ROUTE_PAGES: readonly string[] = ['home', 'contact'];

/** Search engines may keep these files for an hour; a catalog change shows up in the next fetch after that. */
const CACHE_CONTROL = 'public, max-age=3600';

/**
 * Slugs of the published content pages: stored pages that are published, plus system pages that still use their code default.
 * @param app Request container.
 * @returns Slugs without the pages that have their own route.
 */
async function contentPageSlugs(app: Container): Promise<string[]> {
  const stored = await app.pages.list();
  const slugs = new Set(stored.filter((page) => page.isPublished).map((page) => page.slug));
  const storedSlugs = new Set(stored.map((page) => page.slug));
  for (const page of DEFAULT_SYSTEM_PAGES) {
    if (!storedSlugs.has(page.slug) && (SYSTEM_PAGE_SLUGS as readonly string[]).includes(page.slug))
      slugs.add(page.slug);
  }
  return [...slugs].filter((slug) => !OWN_ROUTE_PAGES.includes(slug)).sort();
}

/**
 * Builds the sitemap response.
 * @param app Request container.
 * @param origin Public origin of the request.
 * @returns The XML response.
 */
export async function sitemapResponse(app: Container, origin: string): Promise<Response> {
  const [general, catalog, pageSlugs] = await Promise.all([
    app.settings.get('general'),
    app.catalog({ newDays: 0 }).listSitemapCatalog(),
    contentPageSlugs(app),
  ]);
  const xml = buildSitemap({ origin, defaultLocale: general.defaultLocale, catalog, pageSlugs });
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': CACHE_CONTROL },
  });
}

/**
 * Builds the robots.txt response.
 * @param origin Public origin of the request.
 * @returns The text response.
 */
export function robotsResponse(origin: string): Response {
  return new Response(buildRobots(origin), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': CACHE_CONTROL },
  });
}
