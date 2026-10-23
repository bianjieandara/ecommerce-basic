// D1 side of attributes: an attribute with its ordered values, and the links that stop a value in use from being removed.
import type {
  AdminAttribute,
  AdminAttributeValue,
  AttributeRepository,
} from '@/application/ports/catalog-admin';
import { DomainError } from '@/domain/shared/errors';
import type { Locale } from '@/domain/shared/locale';
import { isUniqueViolation, parseJson, queryAll, queryFirst, statement } from './d1-client';

/** Row of attributes. */
interface AttributeRow {
  id: string;
  code: string;
  name_json: string;
  display: 'buttons' | 'swatches';
  is_filterable: number;
  position: number;
}

/** Row of attribute_values. */
interface ValueRow {
  id: string;
  attribute_id: string;
  code: string;
  label_json: string;
  color_hex: string | null;
  position: number;
}

/** D1-backed attribute repository. */
export class D1AttributeRepository implements AttributeRepository {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  /**
   * Lists every attribute with its values, in display order.
   * @returns All attributes.
   */
  async list(): Promise<AdminAttribute[]> {
    const [attributes, values] = await Promise.all([
      queryAll<AttributeRow>(this.db, 'SELECT * FROM attributes ORDER BY position, code'),
      queryAll<ValueRow>(this.db, 'SELECT * FROM attribute_values ORDER BY position, code'),
    ]);
    return attributes.map((row) =>
      toAttribute(
        row,
        values.filter((value) => value.attribute_id === row.id),
      ),
    );
  }

  /**
   * Finds one attribute.
   * @param id Attribute id.
   * @returns The attribute, or null.
   */
  async findById(id: string): Promise<AdminAttribute | null> {
    return (await this.list()).find((attribute) => attribute.id === id) ?? null;
  }

  /**
   * The ids of attribute values that exist among the given ones.
   * @param ids Candidate value ids.
   * @returns The existing ids.
   */
  async existingValueIds(ids: string[]): Promise<string[]> {
    const rows = await queryAll<{ id: string }>(
      this.db,
      'SELECT id FROM attribute_values WHERE id IN (SELECT value FROM json_each(?))',
      [JSON.stringify(ids)],
    );
    return rows.map((row) => row.id);
  }

  /**
   * True when any variant uses a value of the attribute.
   * @param id Attribute id.
   * @returns Whether it is in use.
   */
  async attributeInUse(id: string): Promise<boolean> {
    const row = await queryFirst<{ n: number }>(
      this.db,
      `SELECT COUNT(*) AS n FROM variant_attribute_values vav
       JOIN attribute_values av ON av.id = vav.attribute_value_id WHERE av.attribute_id = ?`,
      [id],
    );
    return (row?.n ?? 0) > 0;
  }

  /**
   * Whether any of the values is used by a variant, in one query.
   * @param valueIds Attribute value ids.
   * @returns True when at least one is in use.
   */
  async anyValueInUse(valueIds: string[]): Promise<boolean> {
    if (valueIds.length === 0) return false;
    const row = await queryFirst<{ n: number }>(
      this.db,
      'SELECT COUNT(*) AS n FROM variant_attribute_values WHERE attribute_value_id IN (SELECT value FROM json_each(?))',
      [JSON.stringify(valueIds)],
    );
    return (row?.n ?? 0) > 0;
  }

  /**
   * Inserts or updates the attribute and its values in one batch. Values missing from the list are deleted; the caller
   * has already checked that none of them is in use.
   * @param attribute Attribute to save.
   * @throws DomainError CONFLICT when the code is already used.
   */
  async save(attribute: AdminAttribute): Promise<void> {
    const statements = [
      statement(
        this.db,
        `INSERT INTO attributes (id, code, name_json, display, is_filterable, position) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET code = excluded.code, name_json = excluded.name_json,
           display = excluded.display, is_filterable = excluded.is_filterable, position = excluded.position`,
        [
          attribute.id,
          attribute.code,
          JSON.stringify(attribute.name),
          attribute.display,
          attribute.isFilterable ? 1 : 0,
          attribute.position,
        ],
      ),
      statement(
        this.db,
        'DELETE FROM attribute_values WHERE attribute_id = ? AND id NOT IN (SELECT value FROM json_each(?))',
        [attribute.id, JSON.stringify(attribute.values.map((value) => value.id))],
      ),
    ];
    for (const value of attribute.values) {
      statements.push(
        statement(
          this.db,
          `INSERT INTO attribute_values (id, attribute_id, code, label_json, color_hex, position)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET code = excluded.code, label_json = excluded.label_json,
             color_hex = excluded.color_hex, position = excluded.position`,
          [value.id, attribute.id, value.code, JSON.stringify(value.label), value.colorHex, value.position],
        ),
      );
    }
    try {
      await this.db.batch(statements);
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainError('CONFLICT', 'That code is already used');
      throw error;
    }
  }

  /**
   * Deletes an attribute. Its values go with it.
   * @param id Attribute id.
   */
  async delete(id: string): Promise<void> {
    await statement(this.db, 'DELETE FROM attributes WHERE id = ?', [id]).run();
  }
}

/**
 * Maps an attribute row and its values to the port's shape.
 * @param row Attribute row.
 * @param values Its values, in order.
 * @returns The attribute.
 */
function toAttribute(row: AttributeRow, values: ValueRow[]): AdminAttribute {
  return {
    id: row.id,
    code: row.code,
    name: parseJson<Partial<Record<Locale, string>>>(row.name_json, {}),
    display: row.display,
    isFilterable: row.is_filterable === 1,
    position: row.position,
    values: values.map(toValue),
  };
}

/**
 * Maps a value row to the port's shape.
 * @param row Value row.
 * @returns The value.
 */
function toValue(row: ValueRow): AdminAttributeValue {
  return {
    id: row.id,
    code: row.code,
    label: parseJson<Partial<Record<Locale, string>>>(row.label_json, {}),
    colorHex: row.color_hex,
    position: row.position,
  };
}
