// Sample context for WhatsApp: the same sample sections the email previews use, so the template examples sent to Meta and the
// test messages show the same realistic values as the emails do.
import type { Locale } from '@/domain/shared/locale';
import type { SettingsRepository } from '../../ports/content';
import { emptyContext, loadStoreSection, type NotificationContext } from '../context';
import { sampleSections } from '../sample-context';

/**
 * Builds a complete sample context for one language.
 * @param settings Settings repository (general settings give the currency and country).
 * @param siteUrl Public site URL.
 * @param locale Language of the sample text.
 * @returns A context with every section filled.
 */
export async function sampleWhatsAppContext(
  settings: SettingsRepository,
  siteUrl: string,
  locale: Locale,
): Promise<NotificationContext> {
  const general = await settings.get('general');
  const store = await loadStoreSection(settings, siteUrl);
  return {
    ...emptyContext(locale, store),
    ...sampleSections(locale, general.currency, general.country, siteUrl),
    locale,
    store,
  };
}
