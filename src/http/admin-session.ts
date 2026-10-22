// Admin session cookie and the helpers around it. Production uses the __Host- prefix (HTTPS only, no domain, path /). Local
// http development uses a plain name, because browsers refuse Secure cookies on plain http.
import type { AdminUser } from '@/application/ports/identity';
import { DomainError } from '@/domain/shared/errors';
import { ADMIN_PATHS } from '@/domain/shared/paths';

/** Cookie lifetime in seconds; keep in step with SESSION_DAYS in application/identity/sessions.ts. */
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

/** Admin paths in the dashboard area, and nothing else: a `next` value must stay inside it. */
const ADMIN_PATH = /^\/admin(\/[^\s\\]*)?$/;

/**
 * Cookie name for the request's scheme.
 * @param url Request URL.
 * @returns "__Host-admin_session" on HTTPS, "admin_session" otherwise.
 */
export function sessionCookieName(url: URL): string {
  return url.protocol === 'https:' ? '__Host-admin_session' : 'admin_session';
}

/**
 * Reads one cookie from a Cookie header.
 * @param header Cookie header value, or null.
 * @param name Cookie name.
 * @returns The value, or null when absent.
 */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/**
 * Set-Cookie value that stores the session.
 * @param url Request URL (decides the name and the Secure flag).
 * @param token Session token.
 * @returns Header value.
 */
export function sessionSetCookie(url: URL, token: string): string {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

/**
 * Set-Cookie value that removes the session cookie.
 * @param url Request URL (decides the name and the Secure flag).
 * @returns Header value.
 */
export function sessionClearCookie(url: URL): string {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookieName(url)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/**
 * The session token from a request's cookie.
 * @param request Incoming request.
 * @returns The token, or null when there is no session cookie.
 */
export function sessionTokenOf(request: Request): string | null {
  return readCookie(request.headers.get('cookie'), sessionCookieName(new URL(request.url)));
}

/**
 * Who is calling, for the session record and the attempt limits.
 * @param request Incoming request.
 * @returns The client IP (from Cloudflare) and the user agent.
 */
export function clientOf(request: Request): { ip: string | null; userAgent: string | null } {
  return { ip: request.headers.get('CF-Connecting-IP'), userAgent: request.headers.get('user-agent') };
}

/**
 * JSON answer that also starts a session. Sign-in and setup return it; the cookie carries the token.
 * @param url Request URL (decides the cookie name and the Secure flag).
 * @param token Session token.
 * @param data Payload, sent inside the usual `{ ok, data }` envelope.
 * @returns The response.
 */
export function sessionResponse(url: URL, token: string, data: unknown): Response {
  return Response.json(
    { ok: true, data },
    { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': sessionSetCookie(url, token) } },
  );
}

/**
 * Redirect that ends the session: the cookie is cleared on the way.
 * @param url Request URL (decides the cookie name and the Secure flag).
 * @param location Where to go next.
 * @returns A 303 response, so a plain form post lands on the page.
 */
export function signedOutResponse(url: URL, location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Set-Cookie': sessionClearCookie(url) },
  });
}

/**
 * Keeps a `next` parameter inside the admin area, so the sign-in page cannot be used as an open redirect.
 * @param value Raw query value.
 * @returns The path when it is an admin path, otherwise the dashboard.
 */
export function safeAdminPath(value: string | null): string {
  return value && ADMIN_PATH.test(value) ? value : ADMIN_PATHS.dashboard;
}

/**
 * The signed-in admin of a route that needs one. Admin routes are guarded by the middleware; this keeps the types honest.
 * @param admin Admin from the request locals.
 * @returns The admin.
 * @throws DomainError UNAUTHORIZED when nobody is signed in.
 */
export function requireAdmin(admin: AdminUser | null): AdminUser {
  if (!admin) throw new DomainError('UNAUTHORIZED', 'Please sign in to continue.');
  return admin;
}
