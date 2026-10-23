// Admin product list: one query with the filters, paged, returning the rows the table shows.
import type {
  AdminCatalogQueries,
  AdminProductFilter,
  AdminProductRow,
} from '@/application/ports/catalog-admin';
import type { ProductStatus } from '@/domain/catalog/product';
import type { Locale } from '@/domain/shared/locale';
import { type Paginated, toPaginated } from '@/domain/shared/pagination';
import { queryAll, queryFirst, type SqlValue } from './d1-client';
import { PRODUCT_NAME_SQL, productNameMatch, whereClause } from './sql-fragments';

/** One row of the admin list query. */
interface ListRow {
  id: string;
  name: string | null;
  status: ProductStatus;
  base_price_minor: number;
  is_on_sale: number;
  is_featured: number;
  stock: number;
  variant_count: number;
  image_media_id: string | null;
  image_variants_json: string | null;
  updated_at: string;
}

/** D1-backed admin product list. */
export class D1AdminCatalogQueries implements AdminCatalogQueries {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  /**
   * Lists products matching the filters. The name follows the requested language and falls back to any other.
   * Stock counts active variants; a product is out of stock when every active variant is tracked and empty.
   * @param filter Filters and page.
   * @param locale Language of the names.
   * @returns One page of rows.
   */
  async listProducts(filter: AdminProductFilter, locale: Locale): Promise<Paginated<AdminProductRow>> {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (filter.status !== 'all') {
      where.push('p.status = ?');
      params.push(filter.status);
    }
    if (filter.categoryId) {
      where.push(
        'EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ?)',
      );
      params.push(filter.categoryId);
    }
    if (filter.onSale) where.push('p.is_on_sale = 1');
    if (filter.outOfStock) {
      where.push(
        `NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1
           AND (v.track_inventory = 0 OR v.stock > 0))`,
      );
    }
    const match = productNameMatch(filter.search);
    if (match) {
      where.push(match.sql);
      params.push(...match.binds);
    }
    const clause = whereClause(where);

    const counted = await queryFirst<{ n: number }>(
      this.db,
      `SELECT COUNT(*) AS n FROM products p ${clause}`,
      params,
    );
    const rows = await queryAll<ListRow>(
      this.db,
      `SELECT p.id, p.status, p.base_price_minor, p.is_on_sale, p.is_featured, p.updated_at,
         ${PRODUCT_NAME_SQL} AS name,
         (SELECT COALESCE(SUM(v.stock), 0) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS stock,
         (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_count,
         (SELECT i.media_id FROM product_images i WHERE i.product_id = p.id ORDER BY i.position LIMIT 1) AS image_media_id,
         (SELECT m.variants_json FROM product_images i JOIN media_assets m ON m.id = i.media_id
           WHERE i.product_id = p.id ORDER BY i.position LIMIT 1) AS image_variants_json
       FROM products p ${clause}
       ORDER BY p.updated_at DESC, p.id LIMIT ? OFFSET ?`,
      [locale, ...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );
    return toPaginated(rows.map(toRow), counted?.n ?? 0, { page: filter.page, pageSize: filter.pageSize });
  }
}

/**
 * Maps a list row to the port's shape.
 * @param row Row from the list query.
 * @returns The admin list row.
 */
function toRow(row: ListRow): AdminProductRow {
  return {
    id: row.id,
    name: row.name ?? '',
    status: row.status,
    basePriceMinor: row.base_price_minor,
    isOnSale: row.is_on_sale === 1,
    isFeatured: row.is_featured === 1,
    stock: row.stock,
    variantCount: row.variant_count,
    imageMediaId: row.image_media_id,
    imageKey: listImageKey(row.image_variants_json),
    updatedAt: row.updated_at,
  };
}

/** Width the list asks for: the grid tiles are about 240 px wide, so 480 covers a sharp screen. */
const LIST_IMAGE_WIDTH = 480;

/**
 * Picks the stored size closest to what the list shows.
 * @param json variants_json of the media asset, or null without a picture.
 * @returns The storage key, or null when there is no usable variant.
 */
function listImageKey(json: string | null): string | null {
  if (!json) return null;
  try {
    const variants = JSON.parse(json) as { width: number; key: string }[];
    const best = [...variants].sort(
      (a, b) => Math.abs(a.width - LIST_IMAGE_WIDTH) - Math.abs(b.width - LIST_IMAGE_WIDTH),
    )[0];
    return best?.key ?? null;
  } catch {
    return null;
  }
}
