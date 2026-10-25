// Page cache: repeat visits to storefront pages are answered from the Cloudflare edge cache without running the page.
// The key holds a version that every admin save bumps (see defineEndpoint `invalidatesCache`), so a change makes the next
// visit a MISS and the page renders again. Only public, cookie-free 200 pages are stored; anything personal never is.
// A page is fresh for a few minutes. After that the stored copy is still sent at once and the page is renewed behind the
// response (stale-while-revalidate), so a quiet store's visitors do not wait for the database each time the window ends.
import { STOREFRONT_QUERY_PARAMS } from '@/domain/catalog/catalog-query';
import { logEvent } from './log';

/** How long a page counts as fresh, in seconds. After that it is served once more while a new copy is made. */
const PAGE_TTL_SECONDS = 300;

/**
 * How long the edge keeps a page it may still serve stale, in seconds. A page older than this is gone and the next visit renders
 * it while the visitor waits. A bump of the version makes a page unreachable at once, whatever its age.
 */
const STALE_TTL_SECONDS = 86_400;

/** Least time between two renewals of the same page in one isolate, in milliseconds (also the pause after a failed renewal). */
const RENEWAL_BACKOFF_MS = 30_000;

/** Most pages remembered by the renewal back-off. */
const MAX_TRACKED_RENEWALS = 500;

/** Storefront pages (language prefix), except the ones that belong to one visitor. */
const STORE_PAGE = /^\/(?:es|en)(?:\/|$)(?!(?:cart|checkout|orders)(?:\/|$))/;

/** Machine-readable files that change with the catalog. */
const SEO_FILES = new Set(['/sitemap.xml', '/robots.txt']);

/** Content types worth storing. */
const CACHEABLE_TYPE = /^(?:text\/html|application\/xml|text\/plain)/;

/** Query parameters that can change a page. */
const KEY_PARAMS: ReadonlySet<string> = new Set(STOREFRONT_QUERY_PARAMS);

/** Internal headers stored with a page and removed before it is sent. */
const RENDERED_AT = 'x-page-rendered-at';
const FRESH_FOR = 'x-page-fresh-for';
const CLIENT_CONTROL = 'x-page-client-control';

/** When each page was last renewed, or its renewal began, by key. Per isolate: it only has to stop a burst, not coordinate. */
const renewals = new Map<string, number>();

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
  /** Keeps the store step and the renewal alive after the response is sent. */
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

/** How a page is cached: what browsers are told, and how long it stays fresh. */
interface Policy {
  /** The `Cache-Control` sent to visitors. */
  clientControl: string;
  /** Seconds the page counts as fresh. */
  freshSeconds: number;
}

/**
 * Decides how a rendered page is cached. Browsers must ask again every time: a page without max-age gets Cloudflare's zone-wide
 * Browser Cache TTL (4 hours by default), so an edit would stay invisible to returning visitors. A page that sets its own public
 * policy (the sitemap) keeps it, and stays fresh for as long as it says.
 * @param response What the page produced.
 * @returns The policy for this page.
 */
function policyOf(response: Response): Policy {
  const own = response.headers.get('cache-control') ?? '';
  if (!/public/i.test(own)) {
    return {
      clientControl: `public, max-age=0, s-maxage=${PAGE_TTL_SECONDS}`,
      freshSeconds: PAGE_TTL_SECONDS,
    };
  }
  const declared = /s-maxage=(\d+)/i.exec(own) ?? /max-age=(\d+)/i.exec(own);
  return { clientControl: own, freshSeconds: declared ? Number(declared[1]) : PAGE_TTL_SECONDS };
}

/**
 * Stores a page. The edge keeps it for STALE_TTL_SECONDS; how long it counts as fresh travels in internal headers.
 * @param cache The edge cache.
 * @param key Cache key.
 * @param response A cacheable response; its body is consumed.
 * @returns Resolves when the page is stored.
 */
function storePage(cache: Cache, key: string, response: Response): Promise<void> {
  const policy = policyOf(response);
  const headers = new Headers(response.headers);
  headers.set('cache-control', `public, s-maxage=${STALE_TTL_SECONDS}`);
  headers.set(RENDERED_AT, String(Date.now()));
  headers.set(FRESH_FOR, String(policy.freshSeconds));
  headers.set(CLIENT_CONTROL, policy.clientControl);
  return cache.put(key, new Response(response.body, { status: 200, headers }));
}

/**
 * Turns a stored page into the response for a visitor: internal headers removed, the browser policy restored.
 * @param stored The page from the cache.
 * @param status Value of `x-page-cache`.
 * @returns The response.
 */
function servePage(stored: Response, status: 'HIT' | 'STALE'): Response {
  const response = new Response(stored.body, stored);
  const control = response.headers.get(CLIENT_CONTROL);
  response.headers.delete(RENDERED_AT);
  response.headers.delete(FRESH_FOR);
  response.headers.delete(CLIENT_CONTROL);
  if (control) response.headers.set('cache-control', control);
  response.headers.set('x-page-cache', status);
  return response;
}

/**
 * Whether a stored page is past its fresh time.
 * @param stored The page from the cache.
 * @returns True when it should be renewed. A page without the internal headers (stored by an older deploy) counts as fresh: its
 * own s-maxage already limits how long the edge keeps it.
 */
function isStale(stored: Response): boolean {
  const renderedAt = Number(stored.headers.get(RENDERED_AT));
  const freshFor = Number(stored.headers.get(FRESH_FOR));
  if (!Number.isFinite(renderedAt) || !Number.isFinite(freshFor) || renderedAt === 0) return false;
  return Date.now() - renderedAt > freshFor * 1000;
}

/**
 * Renews a stale page behind the response. At most one renewal per page per RENEWAL_BACKOFF_MS in this isolate: a burst of visitors
 * on a stale page, or a page that keeps failing, causes one render at a time and not one per visitor. Nothing here can fail a
 * request: the stored page keeps being served until a renewal succeeds or STALE_TTL_SECONDS passes.
 * @param context Request context (for `waitUntil`).
 * @param cache The edge cache.
 * @param key Cache key of the page.
 * @param render Produces the page.
 */
function renewInBackground(
  context: PageCacheContext,
  cache: Cache,
  key: string,
  render: () => Promise<Response>,
): void {
  const now = Date.now();
  if ((renewals.get(key) ?? 0) > now) return;
  renewals.set(key, now + RENEWAL_BACKOFF_MS);
  if (renewals.size > MAX_TRACKED_RENEWALS) {
    for (const [tracked, until] of renewals) if (until <= now) renewals.delete(tracked);
    // Still full of live entries: forget the oldest, which only costs a possible extra renewal.
    if (renewals.size > MAX_TRACKED_RENEWALS) renewals.delete(renewals.keys().next().value as string);
  }
  context.waitUntil(
    (async () => {
      try {
        const fresh = await render();
        if (isCacheableResponse(fresh)) await storePage(cache, key, fresh);
        else void fresh.body?.cancel();
      } catch (error) {
        logEvent('page_cache.renew_failed', {
          path: context.url.pathname,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    })(),
  );
}

/**
 * Answers from the cache when it can, otherwise renders and stores the page.
 * @param context Request, version reader and background hook.
 * @param render Produces the response when the cache has none, or when a stale page is renewed.
 * @returns The response, with `x-page-cache` HIT (fresh copy), STALE (older copy, renewal started), MISS or BYPASS.
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
  if (hit) {
    if (!isStale(hit)) return servePage(hit, 'HIT');
    renewInBackground(context, cache, key, render);
    return servePage(hit, 'STALE');
  }

  const response = await render();
  if (!isCacheableResponse(response)) return withHeader(response, 'x-page-cache', 'BYPASS');
  context.waitUntil(storePage(cache, key, response.clone()));
  const fresh = withHeader(response, 'x-page-cache', 'MISS');
  fresh.headers.set('cache-control', policyOf(response).clientControl);
  return fresh;
}

/**
 * Makes every cached page unreachable. It runs after a change has been saved, so a failure is logged and never fails the request:
 * the change stands, and the pages catch up when they stop being fresh.
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
