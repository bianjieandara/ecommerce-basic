// SQL that more than one query uses: translated product names and slugs, the variant label, and the text filters of the admin
// lists. Each lives here once, so the product list and the inventory screens cannot drift apart.
import { toPrefixQuery } from './catalog-text';
import type { SqlValue } from './d1-client';

/** Product name in the requested language; another language when that one is missing. Takes the locale as a bind. */
export const PRODUCT_NAME_SQL = `(SELECT t.name FROM product_translations t WHERE t.product_id = p.id ORDER BY (t.locale = ?) DESC LIMIT 1)`;

/** Product slug in the requested language; another language when that one is missing. Takes the locale as a bind. */
export const PRODUCT_SLUG_SQL = `(SELECT t.slug FROM product_translations t WHERE t.product_id = p.id ORDER BY (t.locale = ?) DESC LIMIT 1)`;

/** Variant label: the attribute values in attribute order, in the requested language. Takes the locale as a bind. */
export const VARIANT_LABEL_SQL = `(SELECT GROUP_CONCAT(label, ' / ') FROM (
  SELECT json_extract(av.label_json, '$.' || ?) AS label FROM variant_attribute_values vav
  JOIN attribute_values av ON av.id = vav.attribute_value_id JOIN attributes a ON a.id = av.attribute_id
  WHERE vav.variant_id = v.id ORDER BY a.position))`;

/**
 * Escapes the characters that mean something in a LIKE pattern, so typed text matches literally. Use with `ESCAPE '\'`.
 * @param text What the admin typed.
 * @returns The text with `\`, `%` and `_` escaped.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

/**
 * Condition on the full-text index of product names, for a product alias `p`.
 * @param text What the admin typed.
 * @returns The condition and its bind, or null when the text has no searchable words.
 */
export function productNameMatch(text: string): { sql: string; binds: SqlValue[] } | null {
  const prefix = toPrefixQuery(text);
  if (!prefix) return null;
  return {
    sql: 'p.id IN (SELECT product_id FROM product_search WHERE product_search MATCH ?)',
    binds: [prefix],
  };
}

/**
 * Text search over some columns (matched as typed, anywhere in the value) and over the product name (by word prefix).
 * @param text What the admin typed.
 * @param columns Columns to match literally, for example `v.sku`.
 * @returns The condition and its binds.
 */
export function textSearch(text: string, columns: string[]): { sql: string; binds: SqlValue[] } {
  const like = `%${escapeLike(text)}%`;
  const parts = columns.map((column) => `${column} LIKE ? ESCAPE '\\'`);
  const binds: SqlValue[] = columns.map(() => like);
  const name = productNameMatch(text);
  if (name) {
    parts.push(name.sql);
    binds.push(...name.binds);
  }
  return { sql: `(${parts.join(' OR ')})`, binds };
}

/**
 * Joins conditions into a WHERE clause.
 * @param conditions Conditions, combined with AND.
 * @returns The clause, or an empty string when there are no conditions.
 */
export function whereClause(conditions: string[]): string {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}
