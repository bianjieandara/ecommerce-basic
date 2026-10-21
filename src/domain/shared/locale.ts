// Supported languages. Every localized field is keyed by one of these codes.
// The store default comes from settings (general.defaultLocale); DEFAULT_LOCALE is only the code-level fallback.

/** Languages the storefront and admin support. */
export const SUPPORTED_LOCALES = ['es', 'en'] as const;

/** A supported language code. */
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Code-level fallback used before settings are loaded. */
export const DEFAULT_LOCALE: Locale = 'es';

/**
 * Checks whether an arbitrary string is a supported language code.
 * @param value Candidate code, for example from a URL segment or cookie.
 * @returns True when the code is supported.
 */
export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
