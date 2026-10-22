// Shipping methods persistence (name and description are LocalizedText JSON).
import type { ShippingMethodRecord, ShippingMethodRepository } from '@/application/ports/ordering';
import type { ShippingKind } from '@/domain/ordering/shipping';
import { parseJson, queryAll, statement } from './d1-client';

/** One row of shipping_methods. */
interface ShippingRow {
  id: string;
  kind: ShippingKind;
  name_json: string;
  description_json: string;
  price_minor: number;
  free_over_minor: number | null;
  is_active: number;
  position: number;
}

/** Maps a row to the record used by the application. */
function toRecord(row: ShippingRow): ShippingMethodRecord {
  return {
    id: row.id,
    kind: row.kind,
    name: parseJson(row.name_json, { es: '', en: '' }),
    description: parseJson(row.description_json, { es: '', en: '' }),
    priceMinor: row.price_minor,
    freeOverMinor: row.free_over_minor,
    isActive: row.is_active === 1,
    position: row.position,
  };
}

/** D1-backed shipping method repository. */
export class D1ShippingMethodRepository implements ShippingMethodRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  async listActive(): Promise<ShippingMethodRecord[]> {
    const rows = await queryAll<ShippingRow>(
      this.db,
      'SELECT * FROM shipping_methods WHERE is_active = 1 ORDER BY position, id',
    );
    return rows.map(toRecord);
  }

  async listAll(): Promise<ShippingMethodRecord[]> {
    const rows = await queryAll<ShippingRow>(this.db, 'SELECT * FROM shipping_methods ORDER BY position, id');
    return rows.map(toRecord);
  }

  async save(method: ShippingMethodRecord): Promise<void> {
    await statement(
      this.db,
      `INSERT INTO shipping_methods (id, kind, name_json, description_json, price_minor, free_over_minor, is_active, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name_json = excluded.name_json,
         description_json = excluded.description_json, price_minor = excluded.price_minor,
         free_over_minor = excluded.free_over_minor, is_active = excluded.is_active,
         position = excluded.position`,
      [
        method.id,
        method.kind,
        JSON.stringify(method.name),
        JSON.stringify(method.description),
        method.priceMinor,
        method.freeOverMinor,
        method.isActive ? 1 : 0,
        method.position,
      ],
    ).run();
  }

  async delete(id: string): Promise<void> {
    await statement(this.db, 'DELETE FROM shipping_methods WHERE id = ?', [id]).run();
  }
}
