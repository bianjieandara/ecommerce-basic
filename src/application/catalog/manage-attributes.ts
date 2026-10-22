// Attribute admin: codes and names per language, the value list, and the rule that a value in use cannot be removed.
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
   * @param input Validated attribute input.
   * @returns The attribute id.
   * @throws DomainError NOT_FOUND, VALIDATION_FAILED (missing names, foreign values), CONFLICT (value in use, code taken).
   */
  async upsert(input: AttributeInput): Promise<{ id: string }> {
    const existing = input.id ? await this.deps.attributes.findById(input.id) : null;
    if (input.id && !existing) throw new DomainError('NOT_FOUND', 'Attribute not found');
    const ownValues = new Set(existing?.values.map((value) => value.id) ?? []);
    if (input.values.some((value) => value.id !== null && !ownValues.has(value.id))) {
      throw new DomainError('VALIDATION_FAILED', 'A value does not belong to this attribute');
    }
    const kept = new Set(input.values.map((value) => value.id));
    for (const value of existing?.values ?? []) {
      if (!kept.has(value.id) && (await this.deps.attributes.valueInUse(value.id))) {
        throw new DomainError(
          'CONFLICT',
          'A value in use cannot be removed. Remove it from the products first.',
        );
      }
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
   * @param id Attribute id.
   * @throws DomainError NOT_FOUND, or CONFLICT while a product uses one of its values.
   */
  async remove(id: string): Promise<void> {
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
