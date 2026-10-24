// Page cache: repeat visits to storefront pages are answered from the Cloudflare edge cache without running the page.
// The key holds a version that every admin save bumps (see defineEndpoint `invalidatesCache`), so a change makes the next
// visit a MISS and the page renders again. Only public, cookie-free 200 pages are stored; anything personal never is.
import { STOREFRONT_QUERY_PARAMS } from '@/domain/catalog/catalog-query';
import { logEvent } from './log';

/** How long the edge keeps a page, in seconds. A bump of the version makes it stale sooner. */
const PAGE_TTL_SECONDS = 300;

/** Storefront pages (language prefix), except the ones that belong to one visitor. */
const STORE_PAGE = /^\/(?:es|en)(?:\/|$)(?!(?:cart|checkout|orders)(?:\/|$))/;

/** Machine-readable files that change with the catalog. */
const SEO_FILES = new Set(['/sitemap.xml', '/robots.txt']);

/** Content types worth storing. */
const CACHEABLE_TYPE = /^(?:text\/html|application\/xml|text\/plain)/;

/** Query parameters that can change a page. */
const KEY_PARAMS: ReadonlySet<string> = new Set(STOREFRONT_QUERY_PARAMS);

/**
 * The part of the query string that belongs in a cache key: only the parameters a page reads, in a fixed order. Without this
 * every ad click (a unique `fbclid` or `gclid`) and every `?x=random` would be its own entry and its own full render: the
 * cache would give ad traffic nothing, and anyone could force a render per request.
 * @param url Request URL.
 * @returns A query string with its "?", or an empty string when no parameter matters.
 */
export function cacheKeySearch(url: URL): string {
  const kept = [...url.searchParams].filter(([name]) => KEY_PARAMS.has(name));
  kept.sort(([a, x], [b, y]) => (a === b ? Number(x > y) - Number(x < y) : Number(a > b) - Number(a < b)));
  return kept.length > 0 ? `?${new URLSearchParams(kept).toString()}` : '';
}

/** What the cache needs from the request and the platform. */
export interface PageCacheContext {
  request: Request;
  url: URL;
  /** Current cache version (KV). */
  version: () => Promise<string>;
  /** Id of this deploy (see __BUILD_ID__ in astro.config.mjs). */
  buildId: string;
  /** Keeps the store step alive after the response is sent. */
  waitUntil: (work: Promise<unknown>) => void;
}

/**
 * Whether a request may be served from, and stored in, the page cache.
 * @param request Incoming request.
 * @param url Its URL.
 * @returns True for a GET of a public storefront page, the sitemap or robots.txt, with no order key.
 */
export function isCacheableRequest(request: Request, url: URL): boolean {
  if (request.method !== 'GET') return false;
  // workers.dev has no edge cache of its own to put into; the cache works on a custom domain.
  if (url.hostname.endsWith('.workers.dev')) return false;
  // A link with an order key shows one customer's data.
  if (url.searchParams.has('key')) return false;
  return STORE_PAGE.test(url.pathname) || SEO_FILES.has(url.pathname);
}

/**
 * Whether a response may be stored for everyone.
 * @param response Response the page produced.
 * @returns True for a 200 without cookies, `private` or `no-store`, of a cacheable type.
 */
export function isCacheableResponse(response: Response): boolean {
  if (response.status !== 200 || response.headers.has('set-cookie')) return false;
  if (!CACHEABLE_TYPE.test(response.headers.get('content-type') ?? '')) return false;
  return !/(?:private|no-store|no-cache)/i.test(response.headers.get('cache-control') ?? '');
}

/**
 * Returns a copy of a response with one more header.
 * @param response Source response.
 * @param name Header name.
 * @param value Header value.
 * @returns A response whose headers can be changed.
 */
function withHeader(response: Response, name: string, value: string): Response {
  const copy = new Response(response.body, response);
  copy.headers.set(name, value);
  return copy;
}

/**
 * Answers from the cache when it can, otherwise renders and stores the page.
 * @param context Request, version reader and background hook.
 * @param render Produces the response when the cache has none.
 * @returns The response, with `x-page-cache` HIT, MISS or BYPASS.
 */
export async function withPageCache(
  context: PageCacheContext,
  render: () => Promise<Response>,
): Promise<Response> {
  if (typeof caches === 'undefined' || !isCacheableRequest(context.request, context.url)) return render();
  // The DOM typings of CacheStorage lack `default`, the Workers edge cache; the runtime has it.
  const cache = (caches as unknown as { default: Cache }).default;
  const version = `${context.buildId}.${await context.version()}`;
  const key = `https://page-cache.internal/${version}${context.url.pathname}${cacheKeySearch(context.url)}`;
  const hit = await cache.match(key);
  if (hit) return withHeader(hit, 'x-page-cache', 'HIT');

  const response = await render();
  if (!isCacheableResponse(response)) return withHeader(response, 'x-page-cache', 'BYPASS');
  const stored = response.clone();
  // The edge keeps a page for PAGE_TTL_SECONDS (s-maxage), but browsers must ask again every time: a page without max-age gets
  // Cloudflare's zone-wide Browser Cache TTL (4 hours by default), so an edit would stay invisible to returning visitors.
  // A page that sets its own public policy (the sitemap) keeps it.
  const own = response.headers.get('cache-control') ?? '';
  const control = /public/i.test(own) ? own : `public, max-age=0, s-maxage=${PAGE_TTL_SECONDS}`;
  const headers = new Headers(stored.headers);
  headers.set('cache-control', control);
  context.waitUntil(cache.put(key, new Response(stored.body, { status: 200, headers })));
  const fresh = withHeader(response, 'x-page-cache', 'MISS');
  fresh.headers.set('cache-control', control);
  return fresh;
}

/**
 * Makes every cached page stale. It runs after a change has been saved, so a failure is logged and never fails the request:
 * the change stands, and the pages catch up when their time to live ends.
 * @param version The page-cache version store.
 * @param requestId Request id, for the log line.
 */
export async function bumpPageCache(version: { bump(): Promise<void> }, requestId: string): Promise<void> {
  try {
    await version.bump();
  } catch (error) {
    logEvent('page_cache.bump_failed', {
      requestId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
