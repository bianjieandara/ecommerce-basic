// Shared helpers of the translate button in the admin editors: its texts in the admin language, and the language a translation goes to.
import { SUPPORTED_LOCALES, type Locale } from '@/domain/shared/locale';
import { t } from '@/ui/i18n';
import type { TranslateButtonLabels } from './TranslateButton';

/**
 * Builds every text of the translate button from the admin dictionary, so each editor words it the same way.
 * @param locale Admin language.
 * @returns The texts of the button and its messages.
 */
export function translateButtonLabels(locale: Locale): TranslateButtonLabels {
  return {
    translate: t(locale, 'admin.ai.translate'),
    translating: t(locale, 'admin.ai.translating'),
    hint: t(locale, 'admin.ai.hint'),
    empty: t(locale, 'admin.ai.empty'),
    tooLong: t(locale, 'admin.ai.tooLong'),
    placeholders: t(locale, 'admin.ai.placeholders'),
    failed: t(locale, 'admin.ai.failed'),
  };
}

/**
 * The language a translation of this text goes to. The store has two languages, so it is the one that is not `from`.
 * @param from Language of the text.
 * @returns The other supported language.
 */
export function translateTarget(from: Locale): Locale {
  return SUPPORTED_LOCALES.find((code) => code !== from) ?? from;
}
