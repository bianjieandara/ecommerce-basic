// Saves one settings group from the admin settings form. The values must pass the group's zod schema, the same schema the
// storefront reads with, so a saved value can never break a page.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import { issueCode, type FieldIssue } from '../forms/fields-to-schema';
import type { SettingsRepository } from '../ports/content';
import type { AdminUser } from '../ports/identity';
import type { Clock } from '../ports/platform';
import { SETTINGS_SCHEMAS, type SettingsGroup, type SettingsMap } from './settings-schemas';

/** Dependencies of the settings use case. */
export interface SaveSettingsDeps {
  settings: SettingsRepository;
  clock: Clock;
}

/**
 * Turns a settings group name from the URL into a group.
 * @param name Group name as written in the URL.
 * @returns The group.
 * @throws DomainError NOT_FOUND for a name that is not a settings group.
 */
export function parseSettingsGroup(name: string): SettingsGroup {
  if (!Object.hasOwn(SETTINGS_SCHEMAS, name)) throw new DomainError('NOT_FOUND', 'Settings group not found');
  return name as SettingsGroup;
}

/** Saves one settings group. Owners only. */
export class SaveSettings {
  /** @param deps Settings repository and clock. */
  constructor(private readonly deps: SaveSettingsDeps) {}

  /**
   * Validates the values of a group and stores them.
   * @param actor The signed-in admin.
   * @param group Settings group being saved.
   * @param values The whole group, as the form sends it.
   * @returns The stored value, with defaults applied.
   * @throws DomainError FORBIDDEN without the settings permission; VALIDATION_FAILED with the field issues otherwise.
   */
  async execute(
    actor: AdminUser,
    group: SettingsGroup,
    values: unknown,
  ): Promise<SettingsMap[SettingsGroup]> {
    if (!can(actor.role, 'settings.manage')) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
    }
    const parsed = SETTINGS_SCHEMAS[group].safeParse(values);
    if (!parsed.success) {
      const issues: FieldIssue[] = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issueCode(issue),
        message: issue.message,
      }));
      throw new DomainError('VALIDATION_FAILED', 'Some settings are not valid', { issues });
    }
    await this.deps.settings.save(group, parsed.data, this.deps.clock.now().toISOString());
    return parsed.data;
  }
}
