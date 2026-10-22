// Types and a small builder for the settings form definitions. A group has one entry per key of its zod schema, so a key that
// is added to the schema without a form entry (or the reverse) fails to compile.
import type { FieldDescriptor, FieldOption } from '../forms/field-descriptor';
import type { SettingsGroup, SettingsMap } from './settings-schemas';

/** A field definition without its name: the name is the key the definition sits under. */
export type FieldSpec<F = FieldDescriptor> = F extends FieldDescriptor ? Omit<F, 'name'> : never;

/** The form definition of one settings group, with one entry per key of the group's schema. */
export type GroupFields<G extends SettingsGroup> = { [K in keyof SettingsMap[G]]-?: FieldSpec };

/**
 * Builds one option of a select or multiselect field.
 * @param value Stored value, the same as the schema accepts.
 * @param es Spanish label.
 * @param en English label.
 * @returns The option.
 */
export function option(value: string, es: string, en: string): FieldOption {
  return { value, label: { es, en } };
}
