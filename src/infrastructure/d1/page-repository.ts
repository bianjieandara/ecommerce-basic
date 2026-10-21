// Page persistence: system and custom pages stored as JSON sections (see domain/content/page.ts).
import type { Page } from '@/domain/content/page';
import type { LocalizedText } from '@/domain/shared/localized-text';
import type { PageRepository } from '@/application/ports/content';
import { parseJson, queryAll, queryFirst, statement } from './d1-client';

/** One row of the pages table. */
interface PageRow {
  id: string;
  slug: string;
  kind: 'system' | 'custom';
  title_json: string;
  seo_title_json: string;
  seo_description_json: string;
  sections_json: string;
  is_published: number;
  updated_at: string;
}

/** Maps a row to the domain page. */
function toPage(row: PageRow): Page {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: parseJson<LocalizedText>(row.title_json, { es: '', en: '' }),
    seoTitle: parseJson<Partial<LocalizedText>>(row.seo_title_json, {}),
    seoDescription: parseJson<Partial<LocalizedText>>(row.seo_description_json, {}),
    sections: parseJson<Page['sections']>(row.sections_json, []),
    isPublished: row.is_published === 1,
    updatedAt: row.updated_at,
  };
}

/** D1-backed page repository. */
export class D1PageRepository implements PageRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async findBySlug(slug: string): Promise<Page | null> {
    const row = await queryFirst<PageRow>(this.db, 'SELECT * FROM pages WHERE slug = ?', [slug]);
    return row ? toPage(row) : null;
  }

  async findById(id: string): Promise<Page | null> {
    const row = await queryFirst<PageRow>(this.db, 'SELECT * FROM pages WHERE id = ?', [id]);
    return row ? toPage(row) : null;
  }

  async list(): Promise<Page[]> {
    const rows = await queryAll<PageRow>(this.db, 'SELECT * FROM pages ORDER BY kind, slug');
    return rows.map(toPage);
  }

  async save(page: Page): Promise<void> {
    await statement(
      this.db,
      `INSERT INTO pages (id, slug, kind, title_json, seo_title_json, seo_description_json, sections_json, is_published, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, kind = excluded.kind, title_json = excluded.title_json,
         seo_title_json = excluded.seo_title_json, seo_description_json = excluded.seo_description_json,
         sections_json = excluded.sections_json, is_published = excluded.is_published, updated_at = excluded.updated_at`,
      [
        page.id,
        page.slug,
        page.kind,
        JSON.stringify(page.title),
        JSON.stringify(page.seoTitle),
        JSON.stringify(page.seoDescription),
        JSON.stringify(page.sections),
        page.isPublished ? 1 : 0,
        page.updatedAt,
      ],
    ).run();
  }

  async delete(id: string): Promise<void> {
    await statement(this.db, "DELETE FROM pages WHERE id = ? AND kind = 'custom'", [id]).run();
  }
}
