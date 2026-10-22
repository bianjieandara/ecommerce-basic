// Contact messages: what visitors send through the contact form. The admin inbox reads them from here.
import { toPaginated, type Paginated } from '@/domain/shared/pagination';
import type { Locale } from '@/domain/shared/locale';
import type { ContactMessage, ContactMessageRepository } from '@/application/ports/content';
import { boolToInt, queryAll, queryFirst, statement } from './d1-client';

/** Row shape of contact_messages. */
interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  locale: Locale;
  is_read: number;
  created_at: string;
}

/**
 * Maps a row to the application shape.
 * @param row Database row.
 * @returns Contact message.
 */
function toMessage(row: ContactMessageRow): ContactMessage {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    locale: row.locale,
    isRead: row.is_read === 1,
    createdAt: row.created_at,
  };
}

/** D1-backed contact message repository. */
export class D1ContactMessageRepository implements ContactMessageRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async create(message: ContactMessage): Promise<void> {
    await statement(
      this.db,
      `INSERT INTO contact_messages (id, name, email, phone, message, locale, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        message.name,
        message.email,
        message.phone,
        message.message,
        message.locale,
        boolToInt(message.isRead),
        message.createdAt,
      ],
    ).run();
  }

  async list(page: number, pageSize: number): Promise<Paginated<ContactMessage>> {
    const rows = await queryAll<ContactMessageRow>(
      this.db,
      'SELECT * FROM contact_messages ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
      [pageSize, (page - 1) * pageSize],
    );
    const count = await queryFirst<{ n: number }>(this.db, 'SELECT COUNT(*) AS n FROM contact_messages');
    return toPaginated(rows.map(toMessage), count?.n ?? 0, { page, pageSize });
  }

  async markRead(id: string): Promise<void> {
    await statement(this.db, 'UPDATE contact_messages SET is_read = 1 WHERE id = ?', [id]).run();
  }

  async countUnread(): Promise<number> {
    const row = await queryFirst<{ n: number }>(
      this.db,
      'SELECT COUNT(*) AS n FROM contact_messages WHERE is_read = 0',
    );
    return row?.n ?? 0;
  }
}
