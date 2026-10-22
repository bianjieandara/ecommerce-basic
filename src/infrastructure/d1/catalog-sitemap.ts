// The sitemap read model: slugs of active products and categories in every language, with their last change.
// One batch of two reads; the storefront never lists drafts or archived products, so neither does the sitemap.
import type { SitemapCatalogDto, SitemapEntryDto } from '@/application/dto/catalog-dto';
import { isLocale } from '@/domain/shared/locale';
import { statement } from './d1-client';

/** Most products listed. Every product has one URL per language and a sitemap file holds at most 50,000 URLs. */
const MAX_PRODUCTS = 20_000;

interface SlugRow {
  id: string;
  locale: string;
  slug: string;
  updated_at: string;
}

/**
 * Groups rows of one item per language into one entry per item, keeping the order of first appearance.
 * @param rows Rows ordered by item id.
 * @returns One entry per item.
 */
function groupByItem(rows: SlugRow[]): SitemapEntryDto[] {
  const entries = new Map<string, SitemapEntryDto>();
  for (const row of rows) {
    if (!isLocale(row.locale)) continue;
    const entry = entries.get(row.id) ?? { slugs: {}, updatedAt: row.updated_at };
    entry.slugs[row.locale] = row.slug;
    entries.set(row.id, entry);
  }
  return [...entries.values()];
}

/**
 * Loads the indexable catalog URLs.
 * @param db D1 binding.
 * @returns Active products (newest first) and active categories (in display order).
 */
export async function loadSitemapCatalog(db: D1Database): Promise<SitemapCatalogDto> {
  const [products, categories] = await db.batch<SlugRow>([
    statement(
      db,
      `SELECT p.id, t.locale, t.slug, p.updated_at
         FROM (SELECT id, updated_at FROM products WHERE status = 'active' ORDER BY updated_at DESC, id LIMIT ?) p
         JOIN product_translations t ON t.product_id = p.id
         ORDER BY p.updated_at DESC, p.id, t.locale`,
      [MAX_PRODUCTS],
    ),
    statement(
      db,
      `SELECT c.id, t.locale, t.slug, c.updated_at
         FROM categories c JOIN category_translations t ON t.category_id = c.id
         WHERE c.is_active = 1
         ORDER BY c.position, c.id, t.locale`,
    ),
  ]);
  return {
    products: groupByItem(products?.results ?? []),
    categories: groupByItem(categories?.results ?? []),
  };
}
