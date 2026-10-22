// Testimonial persistence: the rows the testimonials widget shows and the admin list edits.
// The avatar column is not part of the domain type, so saving never touches it.
import type { Testimonial, TestimonialRepository } from '@/application/ports/content';
import { DEFAULT_LOCALE, isLocale } from '@/domain/shared/locale';
import { boolToInt, queryAll, queryFirst, statement } from './d1-client';

/** One row of the testimonials table. */
interface TestimonialRow {
  id: string;
  author_name: string;
  rating: number;
  body: string;
  locale: string;
  is_visible: number;
  position: number;
  created_at: string;
}

/** Order of every list: the admin's position first, then the creation time, then the id so pages never repeat a row. */
const ORDER = 'ORDER BY position, created_at, id';

/**
 * Maps a row to the domain testimonial.
 * @param row Database row.
 * @returns The testimonial.
 */
function toTestimonial(row: TestimonialRow): Testimonial {
  return {
    id: row.id,
    authorName: row.author_name,
    rating: row.rating,
    body: row.body,
    // A stored code that is no longer supported falls back to the default language instead of breaking the list.
    locale: isLocale(row.locale) ? row.locale : DEFAULT_LOCALE,
    isVisible: row.is_visible === 1,
    position: row.position,
    createdAt: row.created_at,
  };
}

/** D1-backed testimonial repository. */
export class D1TestimonialRepository implements TestimonialRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async listVisible(): Promise<Testimonial[]> {
    const rows = await queryAll<TestimonialRow>(
      this.db,
      `SELECT * FROM testimonials WHERE is_visible = 1 ${ORDER}`,
    );
    return rows.map(toTestimonial);
  }

  async listAll(): Promise<Testimonial[]> {
    const rows = await queryAll<TestimonialRow>(this.db, `SELECT * FROM testimonials ${ORDER}`);
    return rows.map(toTestimonial);
  }

  async findById(id: string): Promise<Testimonial | null> {
    const row = await queryFirst<TestimonialRow>(this.db, 'SELECT * FROM testimonials WHERE id = ?', [id]);
    return row ? toTestimonial(row) : null;
  }

  async save(testimonial: Testimonial): Promise<void> {
    // On conflict, created_at is deliberately left out of the update: an edit never moves a testimonial in time.
    await statement(
      this.db,
      `INSERT INTO testimonials (id, author_name, rating, body, locale, is_visible, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET author_name = excluded.author_name, rating = excluded.rating, body = excluded.body,
         locale = excluded.locale, is_visible = excluded.is_visible, position = excluded.position`,
      [
        testimonial.id,
        testimonial.authorName,
        testimonial.rating,
        testimonial.body,
        testimonial.locale,
        boolToInt(testimonial.isVisible),
        testimonial.position,
        testimonial.createdAt,
      ],
    ).run();
  }

  async delete(id: string): Promise<void> {
    await statement(this.db, 'DELETE FROM testimonials WHERE id = ?', [id]).run();
  }
}
