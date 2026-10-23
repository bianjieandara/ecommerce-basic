// Links typed by an admin in a page section ("/shop", "/p/about") have no language, because one link serves both languages.
// This adds the page language in front of them. Full addresses and links that already start with a language are left alone.
import type { Locale } from '@/domain/shared/locale';

/**
 * Gives a section link the language of the page.
 * @param locale Page language.
 * @param href The link as the admin wrote it.
 * @returns "/es/shop" for "/shop" on a Spanish page; any other link unchanged.
 */
export function localizedHref(locale: Locale, href: string): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const first = href.split('/')[1] ?? '';
  return first === 'es' || first === 'en' ? href : `/${locale}${href}`;
}
