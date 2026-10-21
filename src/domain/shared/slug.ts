// URL slugs for products, categories and pages. Used by admin forms (auto slug) and the sitemap.

/** Longest slug we store; longer slugs make URLs hard to read and share. */
const MAX_SLUG_LENGTH = 80;

/**
 * Converts free text to a URL slug: strips accents, lowercases, and joins words with dashes.
 * @param input Any text, for example a product name.
 * @returns A slug of at most 80 characters, or "" when nothing usable remains.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}
