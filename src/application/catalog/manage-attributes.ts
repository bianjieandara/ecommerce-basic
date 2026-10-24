// Attribute admin: codes and names per language, the value list, and the rule that a value in use cannot be removed.
import type { AdminUser } from '../ports/identity';
import { assertCan } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import { SUPPORTED_LOCALES, type Locale } from '@/domain/shared/locale';
import type { AdminAttribute, AttributeRepository } from '../ports/catalog-admin';
import type { IdGenerator } from '../ports/platform';
import type { AttributeInput } from './schemas';

/** Dependencies of ManageAttributes. */
export interface ManageAttributesDeps {
  attributes: AttributeRepository;
  ids: IdGenerator;
}

/** Creates, edits and deletes attributes and their values. */
export class ManageAttributes {
  /** @param deps Repository and ids. */
  constructor(private readonly deps: ManageAttributesDeps) {}

  /**
   * Creates or updates an attribute. A value that a variant uses cannot be removed from the list.
   * @param actor The signed-in admin; needs the catalog permission.
   * @param input Validated attribute input.
   * @returns The attribute id.
   * @throws DomainError FORBIDDEN, NOT_FOUND, VALIDATION_FAILED (missing names, foreign values), CONFLICT (value in use, code taken).
   */
  async upsert(actor: AdminUser, input: AttributeInput): Promise<{ id: string }> {
    assertCan(actor.role, 'catalog.edit');
    const existing = input.id ? await this.deps.attributes.findById(input.id) : null;
    if (input.id && !existing) throw new DomainError('NOT_FOUND', 'Attribute not found');
    const ownValues = new Set(existing?.values.map((value) => value.id) ?? []);
    if (input.values.some((value) => value.id !== null && !ownValues.has(value.id))) {
      throw new DomainError('VALIDATION_FAILED', 'A value does not belong to this attribute');
    }
    const kept = new Set(input.values.map((value) => value.id));
    const removed = (existing?.values ?? []).filter((value) => !kept.has(value.id)).map((value) => value.id);
    if (await this.deps.attributes.anyValueInUse(removed)) {
      throw new DomainError(
        'CONFLICT',
        'A value in use cannot be removed. Remove it from the products first.',
      );
    }
    const attribute: AdminAttribute = {
      id: input.id ?? this.deps.ids.newId(),
      code: input.code,
      name: withText(input.name),
      display: input.display,
      isFilterable: input.isFilterable,
      position: input.position,
      values: input.values.map((value, position) => ({
        id: value.id ?? this.deps.ids.newId(),
        code: value.code,
        label: withText(value.label),
        colorHex: input.display === 'swatches' ? value.colorHex : null,
        position,
      })),
    };
    if (Object.keys(attribute.name).length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'Give the attribute a name in at least one language');
    }
    if (attribute.values.some((value) => Object.keys(value.label).length === 0)) {
      throw new DomainError('VALIDATION_FAILED', 'Every value needs a label in at least one language');
    }
    await this.deps.attributes.save(attribute);
    return { id: attribute.id };
  }

  /**
   * Deletes an attribute that no variant uses.
   * @param actor The signed-in admin; needs the catalog permission.
   * @param id Attribute id.
   * @throws DomainError FORBIDDEN, NOT_FOUND, or CONFLICT while a product uses one of its values.
   */
  async remove(actor: AdminUser, id: string): Promise<void> {
    assertCan(actor.role, 'catalog.edit');
    if (!(await this.deps.attributes.findById(id))) throw new DomainError('NOT_FOUND', 'Attribute not found');
    if (await this.deps.attributes.attributeInUse(id)) {
      throw new DomainError('CONFLICT', 'Products use this attribute. Remove it from them first.');
    }
    await this.deps.attributes.delete(id);
  }
}

/**
 * Keeps only the languages that have text.
 * @param text Typed text per language.
 * @returns The non-empty entries.
 */
function withText(text: Record<Locale, string>): Partial<Record<Locale, string>> {
  const result: Partial<Record<Locale, string>> = {};
  for (const locale of SUPPORTED_LOCALES) {
    if (text[locale]) result[locale] = text[locale];
  }
  return result;
}
