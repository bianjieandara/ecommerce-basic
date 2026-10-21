// Translation lookup. `t()` resolves dot paths such as "cart.empty" and fills {placeholders}.
// Islands receive only the sub-tree they need (see `pickNamespace`) to keep their props and bundles small.
import type { Locale } from '@/domain/shared/locale';
import { en } from './dictionaries/en';
import { es } from './dictionaries/es';

/** The dictionary shape. `en` defines it; `es` must match it. */
export type Dictionary = typeof en;

/** Joins nested keys into dot paths, for example "cart.empty". */
type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Any valid translation key. */
export type DotPath = Leaves<Dictionary>;

const DICTIONARIES: Record<Locale, Dictionary> = { en, es };

/**
 * Translates a key and fills its placeholders. A missing key returns the key itself, which makes gaps visible.
 * @param locale Language to use.
 * @param key Dot path, for example "shop.results".
 * @param params Values for {placeholders}.
 * @returns The translated text.
 */
export function t(locale: Locale, key: DotPath, params?: Record<string, string | number>): string {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      DICTIONARIES[locale],
    );
  if (typeof value !== 'string') return key;
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));
}

/**
 * Returns one top-level namespace (for example "cart") of the dictionary, for passing to islands as a prop.
 * @param locale Language to use.
 * @param namespace Top-level key of the dictionary.
 * @returns The namespace object.
 */
export function pickNamespace<K extends keyof Dictionary>(locale: Locale, namespace: K): Dictionary[K] {
  return DICTIONARIES[locale][namespace];
}
