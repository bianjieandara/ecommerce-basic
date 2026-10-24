// Security headers added to every response by the middleware. The Content-Security-Policy only holds the directives that
// cannot break a page (framing, base URI, plugins): a script policy would have to allow Turnstile, Cloudflare Analytics and
// the inline scripts Astro emits, so it is a separate decision. Camera is allowed for the admin barcode scanner.

/** Seconds HSTS is remembered: one year. */
const HSTS_MAX_AGE = 31_536_000;

/** Headers every response gets. */
const STATIC_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  // The CSP above covers modern browsers; this is the same rule for old ones.
  'X-Frame-Options': 'DENY',
};

/** The one document the admin screens embed in a frame of their own: the invoice preview. */
const ADMIN_FRAMED_DOCUMENT = /^\/api\/admin\/invoices\/[^/]+\/document$/;

/**
 * Headers for the invoice preview: the admin page may frame it (same origin only), and it may run no script at all.
 * Replaces the framing and policy headers of every other response, which forbid all framing.
 */
const FRAMED_DOCUMENT_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; script-src 'none'",
  'X-Frame-Options': 'SAMEORIGIN',
};

/**
 * Sets the security headers on a response. HSTS is sent only over HTTPS, where browsers honor it.
 * @param response Response to decorate. A response whose headers are frozen (a redirect built by the platform) is copied.
 * @param url Request URL, for its protocol and for the one document that may be framed by the admin.
 * @returns The decorated response.
 */
export function withSecurityHeaders(response: Response, url: URL): Response {
  const headers: Record<string, string> = {
    ...STATIC_HEADERS,
    ...(ADMIN_FRAMED_DOCUMENT.test(url.pathname) ? FRAMED_DOCUMENT_HEADERS : {}),
  };
  if (url.protocol === 'https:')
    headers['Strict-Transport-Security'] = `max-age=${HSTS_MAX_AGE}; includeSubDomains`;
  try {
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers)) copy.headers.set(name, value);
    return copy;
  }
}
