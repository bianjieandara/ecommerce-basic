// D1 side of media: asset metadata. The bytes live in R2 under the keys stored here.
import type { MediaAsset, MediaRepository } from '@/application/ports/media';
import type { MediaVariant } from '@/domain/media/media-asset';
import type { Locale } from '@/domain/shared/locale';
import { type Paginated, toPaginated } from '@/domain/shared/pagination';
import { parseJson, queryAll, queryFirst, statement } from './d1-client';

/** Row of media_assets. */
interface MediaRow {
  id: string;
  original_name: string;
  mime_type: string;
  width: number;
  height: number;
  variants_json: string;
  alt_json: string;
  bytes_total: number;
  created_at: string;
}

/** D1-backed media repository. */
export class D1MediaRepository implements MediaRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  /**
   * Lists assets, newest first.
   * @param page Page number, from 1.
   * @param pageSize Assets per page.
   * @returns One page of assets.
   */
  async list(page: number, pageSize: number): Promise<Paginated<MediaAsset>> {
    const counted = await queryFirst<{ n: number }>(this.db, 'SELECT COUNT(*) AS n FROM media_assets');
    const rows = await queryAll<MediaRow>(
      this.db,
      'SELECT * FROM media_assets ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [pageSize, (page - 1) * pageSize],
    );
    return toPaginated(rows.map(toAsset), counted?.n ?? 0, { page, pageSize });
  }

  /**
   * Finds one asset.
   * @param id Asset id.
   * @returns The asset, or null.
   */
  async findById(id: string): Promise<MediaAsset | null> {
    const row = await queryFirst<MediaRow>(this.db, 'SELECT * FROM media_assets WHERE id = ?', [id]);
    return row ? toAsset(row) : null;
  }

  /**
   * Finds the assets among the given ids.
   * @param ids Candidate ids.
   * @returns The assets that exist.
   */
  async findManyByIds(ids: string[]): Promise<MediaAsset[]> {
    const rows = await queryAll<MediaRow>(
      this.db,
      'SELECT * FROM media_assets WHERE id IN (SELECT value FROM json_each(?))',
      [JSON.stringify(ids)],
    );
    return rows.map(toAsset);
  }

  /**
   * Stores asset metadata.
   * @param asset Asset to store.
   */
  async save(asset: MediaAsset): Promise<void> {
    await statement(
      this.db,
      `INSERT INTO media_assets (id, original_name, mime_type, width, height, variants_json, alt_json, bytes_total, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        asset.id,
        asset.originalName,
        asset.mimeType,
        asset.width,
        asset.height,
        JSON.stringify(asset.variants),
        JSON.stringify(asset.alt),
        asset.bytesTotal,
        asset.createdAt,
      ],
    ).run();
  }

  /**
   * Replaces the alternative texts of an asset.
   * @param id Asset id.
   * @param alt Text per language.
   */
  async updateAlt(id: string, alt: Partial<Record<Locale, string>>): Promise<void> {
    await statement(this.db, 'UPDATE media_assets SET alt_json = ? WHERE id = ?', [
      JSON.stringify(alt),
      id,
    ]).run();
  }

  /**
   * Deletes the metadata of an asset.
   * @param id Asset id.
   */
  async delete(id: string): Promise<void> {
    await statement(this.db, 'DELETE FROM media_assets WHERE id = ?', [id]).run();
  }

  /**
   * True while a product image, a variant image, a category image or a testimonial avatar points at the asset.
   * @param id Asset id.
   * @returns Whether anything uses it.
   */
  async isInUse(id: string): Promise<boolean> {
    const row = await queryFirst<{ n: number }>(
      this.db,
      `SELECT (SELECT COUNT(*) FROM product_images WHERE media_id = ?)
            + (SELECT COUNT(*) FROM product_variants WHERE image_media_id = ?)
            + (SELECT COUNT(*) FROM categories WHERE image_media_id = ?)
            + (SELECT COUNT(*) FROM testimonials WHERE avatar_media_id = ?) AS n`,
      [id, id, id, id],
    );
    return (row?.n ?? 0) > 0;
  }
}

/**
 * Maps a row to the port's asset shape.
 * @param row Row of media_assets.
 * @returns The asset.
 */
function toAsset(row: MediaRow): MediaAsset {
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    variants: parseJson<MediaVariant[]>(row.variants_json, []),
    alt: parseJson<Partial<Record<Locale, string>>>(row.alt_json, {}),
    bytesTotal: row.bytes_total,
    createdAt: row.created_at,
  };
}
