// Page cache: repeat visits to storefront pages are answered from the Cloudflare edge cache without running the page.
// The key holds a version that every admin save bumps (see defineEndpoint `invalidatesCache`), so a change makes the next
// visit a MISS and the page renders again. Only public, cookie-free 200 pages are stored; anything personal never is.
import { logEvent } from './log';

/** How long the edge keeps a page, in seconds. A bump of the version makes it stale sooner. */
const PAGE_TTL_SECONDS = 300;

/** Storefront pages (language prefix), except the ones that belong to one visitor. */
const STORE_PAGE = /^\/(?:es|en)(?:\/|$)(?!(?:cart|checkout|orders)(?:\/|$))/;

/** Machine-readable files that change with the catalog. */
const SEO_FILES = new Set(['/sitemap.xml', '/robots.txt']);

/** Content types worth storing. */
const CACHEABLE_TYPE = /^(?:text\/html|application\/xml|text\/plain)/;

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
  const key = `https://page-cache.internal/${version}${context.url.pathname}${context.url.search}`;
  const hit = await cache.match(key);
  if (hit) return withHeader(hit, 'x-page-cache', 'HIT');

  const response = await render();
  if (!isCacheableResponse(response)) return withHeader(response, 'x-page-cache', 'BYPASS');
  const stored = response.clone();
  const headers = new Headers(stored.headers);
  if (!/public/i.test(headers.get('cache-control') ?? '')) {
    headers.set('cache-control', `public, s-maxage=${PAGE_TTL_SECONDS}`);
  }
  context.waitUntil(cache.put(key, new Response(stored.body, { status: 200, headers })));
  return withHeader(response, 'x-page-cache', 'MISS');
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
