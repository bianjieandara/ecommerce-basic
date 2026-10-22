// Turns the field issues of a refused save into messages keyed by path, so each form control can show its own refusal.
// The server sends a code per issue; the code is translated from the `errors` namespace. A refusal without a code, or a code
// with no translation yet, shows the generic `invalid` text.
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/domain/shared/locale';
import { t, type DotPath } from '@/ui/i18n';

/**
 * Language of the page, which the layout sets on the document. The admin islands show their messages in it.
 * @returns The page language, or the default when the document does not say.
 */
function pageLocale(): Locale {
  const lang = typeof document === 'undefined' ? '' : document.documentElement.lang;
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
}

/**
 * Translates the code of one issue.
 * @param code Display code from the server, if any.
 * @param invalid Generic text for a refusal with no translation.
 * @param locale Language of the page.
 * @returns The translated text, or the generic text.
 */
function issueText(code: string | undefined, invalid: string, locale: Locale): string {
  if (!code) return invalid;
  // The key is built at run time from the server's code, so the typed dictionary cannot check it.
  const key = `errors.${code}`;
  const text = t(locale, key as DotPath);
  return text === key ? invalid : text;
}

/**
 * Reads the field issues of a refused save.
 * @param details Details of the refused call: `{ issues: [{ path, code, message }] }`.
 * @param invalid Generic message for a refused field with no specific text.
 * @param locale Language of the messages; defaults to the page language.
 * @returns Messages keyed by path.
 */
export function issueMessages(
  details: unknown,
  invalid: string,
  locale: Locale = pageLocale(),
): Record<string, string> {
  const issues = (details as { issues?: { path: string; code?: string }[] } | null)?.issues ?? [];
  return Object.fromEntries(issues.map((issue) => [issue.path, issueText(issue.code, invalid, locale)]));
}
