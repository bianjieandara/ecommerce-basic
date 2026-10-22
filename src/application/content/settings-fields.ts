// The settings form definitions of every group, and the fields of one group in the order the form shows them.
import type { FieldDescriptor } from '../forms/field-descriptor';
import { businessFieldDefinitions } from './settings-fields-business';
import { storeFieldDefinitions } from './settings-fields-store';
import type { SettingsGroup } from './settings-schemas';

/** Form definitions of every settings group. Each entry is checked against the group's schema by the compiler. */
export const SETTINGS_FIELDS = { ...storeFieldDefinitions, ...businessFieldDefinitions };

/**
 * The fields of one settings group, named by their schema keys, in the order the form shows them.
 * @param group Settings group.
 * @returns Field descriptors for the settings form.
 */
export function settingsFormFields(group: SettingsGroup): FieldDescriptor[] {
  return Object.entries(SETTINGS_FIELDS[group]).map(([name, spec]) => ({ name, ...spec }) as FieldDescriptor);
}
