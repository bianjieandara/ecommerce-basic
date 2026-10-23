// Store-wide data every public page needs: settings groups and the locale the request resolves to.
// Pages call this once in their frontmatter, so no page reads settings in a different way.
import type { Container } from '@/composition/create-container';
import type { SettingsMap } from '@/application/content/settings-schemas';
import { isLocale, type Locale } from '@/domain/shared/locale';
import { DEFAULT_LOCALE } from '@/domain/shared/locale';

/** Settings groups that public pages read. */
export interface StoreContext {
  general: SettingsMap['general'];
  contact: SettingsMap['contact'];
  theme: SettingsMap['theme'];
  catalog: SettingsMap['catalog'];
  tax: SettingsMap['tax'];
  integrations: SettingsMap['integrations'];
  seo: SettingsMap['seo'];
}

/**
 * Loads the settings groups used by public pages in one place.
 * @param app Request container.
 * @returns The settings snapshot for this request.
 */
export async function loadStoreContext(app: Container): Promise<StoreContext> {
  const [general, contact, theme, catalog, tax, integrations, seo] = await Promise.all([
    app.settings.get('general'),
    app.settings.get('contact'),
    app.settings.get('theme'),
    app.settings.get('catalog'),
    app.settings.get('tax'),
    app.settings.get('integrations'),
    app.settings.get('seo'),
  ]);
  return { general, contact, theme, catalog, tax, integrations, seo };
}

/**
 * Chooses the request language: the `locale` cookie the visitor picked, then the store default. The browser's
 * Accept-Language header is ignored on purpose: a store set to Spanish must not switch to English for an English browser.
 * @param request Incoming request.
 * @param defaultLocale Store default language.
 * @returns A supported locale.
 */
export function resolveLocale(request: Request, defaultLocale: Locale = DEFAULT_LOCALE): Locale {
  const cookie = /(?:^|;\s*)locale=(es|en)(?:;|$)/.exec(request.headers.get('cookie') ?? '')?.[1];
  if (cookie && isLocale(cookie)) return cookie;
  return defaultLocale;
}
