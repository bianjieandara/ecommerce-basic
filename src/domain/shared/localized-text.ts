// Text stored once per language, for short labels and content fields (names, titles, settings texts).
import { SUPPORTED_LOCALES, type Locale } from './locale';

/** One string per supported language. */
export type LocalizedText = Record<Locale, string>;

/**
 * Returns the text for `locale`, then for `fallback`, then the first non-empty language.
 * @param text Localized value; may be partial or missing.
 * @param locale Language the page is rendered in.
 * @param fallback Language to use when `locale` is empty.
 * @returns A non-empty string, or "" when every language is empty.
 */
export function pickText(text: Partial<LocalizedText> | undefined, locale: Locale, fallback: Locale): string {
  const primary = text?.[locale];
  if (primary) return primary;
  const backup = text?.[fallback];
  if (backup) return backup;
  for (const code of SUPPORTED_LOCALES) {
    const value = text?.[code];
    if (value) return value;
  }
  return '';
}

/**
 * Builds a LocalizedText with the same value in every language.
 * @param value Text to repeat (for example a brand name).
 * @returns The localized text.
 */
export function sameTextInAllLocales(value: string): LocalizedText {
  return { es: value, en: value };
}

/**
 * Builds a LocalizedText from one string per language. Definitions of blocks and fields use it for their labels.
 * @param es Spanish text.
 * @param en English text.
 * @returns The localized text.
 */
export function bilingual(es: string, en: string): LocalizedText {
  return { es, en };
}
