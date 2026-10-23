// Language of a request for pages with no store context (error pages): the URL's language prefix wins, then the cookie
// and default order of resolveLocale.
import { isLocale, type Locale } from '@/domain/shared/locale';
import { resolveLocale } from './store-context';

/**
 * Chooses the language of an error page.
 * @param request Incoming request.
 * @param originPathname Path the visitor asked for; Astro.originPathname keeps it when a page rewrote to the error page.
 * @returns A supported locale.
 */
export function requestLocale(request: Request, originPathname: string): Locale {
  const prefix = originPathname.split('/')[1] ?? '';
  return isLocale(prefix) ? prefix : resolveLocale(request);
}
