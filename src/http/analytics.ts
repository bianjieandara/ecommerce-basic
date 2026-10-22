// Server analytics for storefront pages: builds the request context (country, device class, referrer host, campaign) and writes
// page_view for every storefront HTML page. view_item comes only from the browser beacon (it carries the product and the pixel
// event id), so a product page is never counted twice. The dataset is cookieless and keeps no IP or user agent; those reach Meta
// only through the consent-gated Conversions API job. Analytics never fails a page: every error is logged and dropped.
import type { AnalyticsWriter, TrackedEvent, UtmParams } from '@/application/ports/analytics';
import type { Clock } from '@/application/ports/platform';
import { consentCookieValue, marketingAllowed, parseConsent } from '@/domain/consent/consent';
import { localeOfPath } from '@/domain/analytics/tracked-events';
import { readCookie } from './admin-session';
import { logEvent } from './log';

/** Longest campaign value kept; anything longer is noise or an attack on the dataset. */
const MAX_UTM_LENGTH = 100;

/** Campaign parameters the dataset keeps, with the names they carry in the URL. */
const UTM_PARAMS: Record<keyof UtmParams, string> = {
  source: 'utm_source',
  medium: 'utm_medium',
  campaign: 'utm_campaign',
  term: 'utm_term',
  content: 'utm_content',
};

/**
 * Coarse device class from the user agent. The dataset keeps no user agent, only this class.
 * @param userAgent User-Agent header, or null.
 * @returns mobile, tablet or desktop.
 */
export function deviceOf(userAgent: string | null): TrackedEvent['context']['device'] {
  const ua = userAgent ?? '';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobi/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Host of the referrer, unless the visitor came from this site.
 * @param referer Referer header, or null.
 * @param ownHost Host of the request.
 * @returns The other site's host, or null.
 */
function referrerHostOf(referer: string | null, ownHost: string): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).host;
    return host === ownHost ? null : host;
  } catch {
    return null;
  }
}

/**
 * Campaign parameters of the landing URL. Only the five utm keys are read, each trimmed and capped.
 * @param params Query string of the request.
 * @returns The campaign values that are present.
 */
function utmOf(params: URLSearchParams): UtmParams {
  const utm: UtmParams = {};
  for (const [key, name] of Object.entries(UTM_PARAMS) as [keyof UtmParams, string][]) {
    const value = params.get(name)?.trim().slice(0, MAX_UTM_LENGTH);
    if (value) utm[key] = value;
  }
  return utm;
}

/**
 * Builds the context of one request. Reads headers and cookies only; nothing here calls out.
 * @param request Incoming request.
 * @returns The context the analytics writer and the Meta job receive.
 */
export function eventContextOf(request: Request): TrackedEvent['context'] {
  const url = new URL(request.url);
  const cookies = request.headers.get('cookie');
  const userAgent = request.headers.get('user-agent');
  const country = request.headers.get('cf-ipcountry');
  return {
    ip: request.headers.get('cf-connecting-ip'),
    userAgent,
    // Cloudflare sends "XX" or "T1" when the country is unknown or Tor: those are not countries.
    country: country !== null && /^[A-Z]{2}$/.test(country) ? country : null,
    device: deviceOf(userAgent),
    referrerHost: referrerHostOf(request.headers.get('referer'), url.host),
    utm: utmOf(url.searchParams),
    fbp: readCookie(cookies, '_fbp') ?? undefined,
    fbc: readCookie(cookies, '_fbc') ?? undefined,
    marketingConsent: marketingAllowed(parseConsent(consentCookieValue(cookies))),
  };
}

/** What the recorder needs from the container. */
export interface PageViewDeps {
  analytics: AnalyticsWriter;
  clock: Clock;
  requestId: string;
}

/**
 * Records the storefront page that is being served. Only successful GET requests for HTML under a language prefix count, so
 * admin pages, API routes, feeds and error pages are never recorded. The write is synchronous and cheap, and the response is
 * returned unchanged. Any error is logged and dropped: a broken analytics binding must never fail a page.
 * @param deps Writer, clock and the request id (used as the event id).
 * @param request Incoming request.
 * @param response Response being served, from the page cache or the page.
 */
export function recordPageView(deps: PageViewDeps, request: Request, response: Response): void {
  try {
    if (request.method !== 'GET' || !response.ok) return;
    if (!(response.headers.get('content-type') ?? '').startsWith('text/html')) return;
    const url = new URL(request.url);
    const locale = localeOfPath(url.pathname);
    if (locale === null) return;
    deps.analytics.write({
      id: deps.requestId,
      name: 'page_view',
      occurredAt: deps.clock.now().toISOString(),
      url: url.pathname,
      locale,
      context: eventContextOf(request),
    });
  } catch (error) {
    logEvent('analytics.page_view_failed', { reason: error instanceof Error ? error.message : 'unknown' });
  }
}
