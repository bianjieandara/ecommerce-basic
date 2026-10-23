// Product catalog feed for Meta Commerce Manager and Google Merchant Center: one feed per language (?locale=es|en) and per
// service (?target=meta|google, Meta by default; the two spell the availability differently).
// Loads the settings and the catalog rows; the builder in application/marketing does the XML.
import type { APIRoute } from 'astro';
import { buildProductFeed, FEED_TARGETS, type FeedTarget } from '@/application/marketing/build-product-feed';
import { DEFAULT_LOCALE, isLocale } from '@/domain/shared/locale';

/** Feeds are re-read by the platforms about hourly; a shared cache keeps the catalog query off the hot path. */
const CACHE_CONTROL = 'public, s-maxage=3600';

/**
 * Answers 404 with no body. A disabled or unknown feed should not reveal that the store has a feed at all.
 * @returns Empty 404 response, never cached.
 */
function notFound(): Response {
  return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
}

export const GET: APIRoute = async ({ locals, url }) => {
  const requested = url.searchParams.get('locale') ?? DEFAULT_LOCALE;
  if (!isLocale(requested)) return notFound();
  const target = url.searchParams.get('target') ?? 'meta';
  if (!(FEED_TARGETS as readonly string[]).includes(target)) return notFound();
  const app = locals.app;
  const [marketing, general] = await Promise.all([
    app.settings.get('marketing'),
    app.settings.get('general'),
  ]);
  if (!marketing.feedEnabled) return notFound();
  const items = await app.catalog({ newDays: 0 }).listForFeed(requested);
  const xml = buildProductFeed({
    items,
    locale: requested,
    target: target as FeedTarget,
    siteUrl: app.config.siteUrl,
    settings: {
      brand: marketing.feedBrand || general.storeName,
      storeName: general.storeName,
      currency: general.currency,
    },
  });
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': CACHE_CONTROL },
  });
};
