// Names of the settings groups in the admin's language. The settings index and the group pages both read them from here.
import type { Locale } from '@/domain/shared/locale';
import type { SettingsGroup } from '@/application/content/settings-schemas';
import { t } from '@/ui/i18n';

/**
 * Names of every settings group.
 * @param locale Admin language.
 * @returns The name of each group, keyed by group.
 */
export function settingsGroupNames(locale: Locale): Record<SettingsGroup, string> {
  return {
    general: t(locale, 'admin.settings.groups.general'),
    contact: t(locale, 'admin.settings.groups.contact'),
    theme: t(locale, 'admin.settings.groups.theme'),
    catalog: t(locale, 'admin.settings.groups.catalog'),
    inventory: t(locale, 'admin.settings.groups.inventory'),
    checkout: t(locale, 'admin.settings.groups.checkout'),
    tax: t(locale, 'admin.settings.groups.tax'),
    invoicing: t(locale, 'admin.settings.groups.invoicing'),
    whatsapp: t(locale, 'admin.settings.groups.whatsapp'),
    marketing: t(locale, 'admin.settings.groups.marketing'),
    reports: t(locale, 'admin.settings.groups.reports'),
    seo: t(locale, 'admin.settings.groups.seo'),
    integrations: t(locale, 'admin.settings.groups.integrations'),
  };
}
