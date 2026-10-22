// Translator port: machine translation of one text between the supported languages. Implemented by the Workers AI adapter.
import type { Locale } from '@/domain/shared/locale';

/** Translates plain text. Placeholders are masked by the caller, so the translator only sees ordinary text. */
export interface TextTranslator {
  /**
   * Translates one text.
   * @param text Text to translate (already masked by the caller).
   * @param from Language of the text.
   * @param to Language of the translation.
   * @returns The translated text.
   * @throws RetryableError when the provider does not answer in a usable way.
   */
  translate(text: string, from: Locale, to: Locale): Promise<string>;
}
