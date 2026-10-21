// Root URL: sends the visitor to their language (cookie, then browser preference, then the store default).
import type { APIRoute } from 'astro';
import { loadStoreContext, resolveLocale } from '@/http/store-context';
import { PATHS } from '@/domain/shared/paths';

export const GET: APIRoute = async ({ request, locals }) => {
  const store = await loadStoreContext(locals.app);
  const locale = resolveLocale(request, store.general.defaultLocale);
  return new Response(null, { status: 302, headers: { Location: PATHS.home(locale) } });
};
