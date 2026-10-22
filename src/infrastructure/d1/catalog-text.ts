// Small helpers of the storefront read model: search terms, the image chosen for a card, and localized labels.
import type { Locale } from '@/domain/shared/locale';
import { parseJson } from './d1-client';

/**
 * Converts a search term to a safe FTS5 prefix query ("cami cla" -> "cami* cla*").
 * @param term What the visitor or the admin typed.
 * @returns The query, or null when the term has no searchable words.
 */
export function toPrefixQuery(term: string): string | null {
  const tokens = term
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.length === 0 ? null : tokens.map((token) => `${token}*`).join(' ');
}

/**
 * Picks the URL of the largest stored variant at or below 960 px, for cards.
 * @param json Stored variants JSON.
 * @returns Storage key or null.
 */
export function cardImageKey(json: string | null): string | null {
  const variants = parseJson<{ width: number; key: string }[]>(json, []);
  const chosen = [...variants]
    .sort((a, b) => a.width - b.width)
    .filter((variant) => variant.width <= 960)
    .pop();
  return chosen?.key ?? variants[0]?.key ?? null;
}

/**
 * Picks the label for a locale from a stored LocalizedText JSON value, falling back to English then Spanish.
 * @param json Stored JSON, for example '{"es":"Negro","en":"Black"}'.
 * @param locale Requested language.
 * @returns Label text ("" when missing).
 */
export function pickLabel(json: string, locale: Locale): string {
  const value = parseJson<Partial<Record<Locale, string>>>(json, {});
  return value[locale] || value.en || value.es || '';
}
