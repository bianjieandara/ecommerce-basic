// Email template administration: lists the defaults with their overrides, validates and saves edited copy, restores a
// default, and renders previews from sample data. The admin editor and the DEV preview use these methods.
import { DomainError } from '@/domain/shared/errors';
import { SUPPORTED_LOCALES, type Locale } from '@/domain/shared/locale';
import type { LocalizedText } from '@/domain/shared/localized-text';
import type { SettingsRepository } from '../ports/content';
import type { EmailTemplateOverride, EmailTemplateRepository, NotificationKey } from '../ports/notifications';
import type { Clock } from '../ports/platform';
import { emptyContext, loadStoreSection, type NotificationSections } from './context';
import { EMAIL_DEFINITIONS, rulesFor } from './email';
import type { EmailDefinition } from './email/definition';
import { sampleSections } from './sample-context';
import { copyFor, renderEmail, type EmailCopy, type RenderedEmail } from './render-email';
import { validateTemplate } from './template-engine';

/** One email as the admin editor shows it. */
export interface EmailTemplateEntry {
  definition: EmailDefinition;
  /** The saved override, or null while the code default is in use. */
  override: EmailTemplateOverride | null;
}

/** Dependencies of the template service. */
export interface EmailTemplateServiceDeps {
  templates: EmailTemplateRepository;
  settings: SettingsRepository;
  clock: Clock;
  siteUrl: string;
}

/**
 * Throws when a copy uses a variable or block its email does not allow.
 * @param definition Email the copy belongs to.
 * @param copy Subject and body to check.
 * @throws DomainError VALIDATION_FAILED, with the list of problems in `details`.
 */
function assertValid(definition: EmailDefinition, copy: EmailCopy): void {
  const rules = rulesFor(definition);
  const problems = [
    ...new Set([
      ...validateTemplate(copy.subject, rules, 'subject'),
      ...validateTemplate(copy.body, rules, 'body'),
    ]),
  ];
  if (problems.length > 0) {
    throw new DomainError('VALIDATION_FAILED', 'The email uses placeholders that are not allowed', {
      problems,
    });
  }
}

/** Email template use cases. */
export class EmailTemplateService {
  /** @param deps Template overrides, settings, clock and the site URL. */
  constructor(private readonly deps: EmailTemplateServiceDeps) {}

  /** Every notification email with its override (null while the default is used). */
  async list(): Promise<EmailTemplateEntry[]> {
    const overrides = await this.deps.templates.list();
    const byKey = new Map(overrides.map((override) => [override.key, override]));
    return Object.values(EMAIL_DEFINITIONS).map((definition) => ({
      definition,
      override: byKey.get(definition.key) ?? null,
    }));
  }

  /**
   * One email with its override.
   * @param key Notification key.
   */
  async get(key: NotificationKey): Promise<EmailTemplateEntry> {
    return { definition: EMAIL_DEFINITIONS[key], override: await this.deps.templates.find(key) };
  }

  /**
   * Validates an edited email in every language, then saves it.
   * @param key Notification key.
   * @param input Subject and body per language, and whether the email is sent.
   * @throws DomainError VALIDATION_FAILED when a placeholder is unknown or not allowed for the email.
   */
  async save(
    key: NotificationKey,
    input: { subject: LocalizedText; body: LocalizedText; enabled: boolean },
  ): Promise<void> {
    const definition = EMAIL_DEFINITIONS[key];
    for (const locale of SUPPORTED_LOCALES) {
      assertValid(definition, { subject: input.subject[locale], body: input.body[locale] });
    }
    await this.deps.templates.save({
      key,
      subject: input.subject,
      body: input.body,
      enabled: input.enabled,
      updatedAt: this.deps.clock.now().toISOString(),
    });
  }

  /**
   * Removes the override, so the code default is used again.
   * @param key Notification key.
   */
  async restore(key: NotificationKey): Promise<void> {
    await this.deps.templates.delete(key);
  }

  /**
   * Sample sections in the store's currency and country, for previews and test notifications.
   * @param locale Language of the sample text.
   */
  async sample(locale: Locale): Promise<NotificationSections> {
    const general = await this.deps.settings.get('general');
    return sampleSections(locale, general.currency, general.country, this.deps.siteUrl);
  }

  /**
   * Renders an email with sample data. A draft is validated the same way a save is.
   * @param key Notification key.
   * @param locale Language to render.
   * @param draft Copy to preview instead of the saved one.
   * @returns The rendered email.
   */
  async preview(key: NotificationKey, locale: Locale, draft?: EmailCopy): Promise<RenderedEmail> {
    const definition = EMAIL_DEFINITIONS[key];
    const copy = draft ?? copyFor(await this.deps.templates.find(key), definition, locale);
    assertValid(definition, copy);
    const store = await loadStoreSection(this.deps.settings, this.deps.siteUrl);
    const context = { ...emptyContext(locale, store), ...(await this.sample(locale)), locale, store };
    return renderEmail(copy, context);
  }
}
