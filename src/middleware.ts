// Request middleware: attaches the container and a request id, resolves the admin session, and guards the admin area.
// The public admin pages and endpoints (setup, sign-in, password reset) stay open; everything else under /admin and
// /api/admin needs a session.
import { defineMiddleware } from 'astro:middleware';
import { createContainer } from '@/composition/create-container';
import { DomainError } from '@/domain/shared/errors';
import { ADMIN_PATHS } from '@/domain/shared/paths';
import { sessionTokenOf } from '@/http/admin-session';
import { errorResponse } from '@/http/errors';
import { getEnv, getExecutionContext } from '@/infrastructure/cloudflare/env';

/** Admin pages anyone may open. */
const PUBLIC_ADMIN_PAGES = new Set<string>([
  ADMIN_PATHS.setup,
  ADMIN_PATHS.login,
  ADMIN_PATHS.forgotPassword,
  ADMIN_PATHS.resetPassword,
  ADMIN_PATHS.acceptInvite,
]);

/** Admin endpoints anyone may call. Sign-out stays open so a stale cookie can still be cleared. */
const PUBLIC_ADMIN_APIS = new Set<string>([
  '/api/admin/setup',
  '/api/admin/login',
  '/api/admin/logout',
  '/api/admin/password/forgot',
  '/api/admin/password/reset',
]);

/**
 * Marks an admin response as private and keeps it out of search engines.
 * @param response Response to decorate.
 * @returns The same response.
 */
function adminHeaders(response: Response): Response {
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-robots-tag', 'noindex, nofollow');
  return response;
}

/**
 * Runs before every request: attaches the container and the admin session, then guards the admin area.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.requestId = crypto.randomUUID();
  const app = createContainer(getEnv(), getExecutionContext(context.locals));
  context.locals.app = app;
  context.locals.admin = null;

  const path = context.url.pathname;
  const isAdminPage = path === ADMIN_PATHS.dashboard || path.startsWith('/admin/');
  const isAdminApi = path.startsWith('/api/admin/');
  // Only the admin area needs the session. Storefront pages never read it, so an admin browsing the shop costs no query.
  if (!isAdminPage && !isAdminApi) return next();

  const token = sessionTokenOf(context.request);
  context.locals.admin = token ? await app.sessions.resolve(token) : null;

  const isPublic = PUBLIC_ADMIN_PAGES.has(path) || PUBLIC_ADMIN_APIS.has(path);
  if (!isPublic && !context.locals.admin) {
    const denied = isAdminApi
      ? errorResponse(
          new DomainError('UNAUTHORIZED', 'Please sign in to continue.'),
          context.locals.requestId,
        )
      : context.redirect(`${ADMIN_PATHS.login}?next=${encodeURIComponent(path)}`);
    return adminHeaders(denied);
  }
  return adminHeaders(await next());
});
