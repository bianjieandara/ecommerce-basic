// Email template administration: lists the defaults with their overrides, validates and saves edited copy, restores a
// default, and renders previews from sample data. The admin editor and the DEV preview use these methods.
import { can, type Permission } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import { SUPPORTED_LOCALES, type Locale } from '@/domain/shared/locale';
import type { LocalizedText } from '@/domain/shared/localized-text';
import type { SettingsRepository } from '../ports/content';
import type { AdminUser } from '../ports/identity';
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
 * One refused field. The path is `subject.<locale>` or `body.<locale>`, so the editor shows it on the right language tab.
 * The message is for logs and tests; the editor shows its own translated text for every refused field.
 */
interface CopyIssue {
  path: string;
  message: string;
}

/**
 * Lists the placeholders of one language's subject and body that the email does not allow.
 * @param definition Email the copy belongs to.
 * @param locale Language of the copy.
 * @param copy Subject and body to check.
 * @returns The refused fields; empty when the copy is valid.
 */
function copyIssues(definition: EmailDefinition, locale: Locale, copy: EmailCopy): CopyIssue[] {
  const rules = rulesFor(definition);
  return (['subject', 'body'] as const).flatMap((field) =>
    validateTemplate(copy[field], rules, field).map((message) => ({ path: `${field}.${locale}`, message })),
  );
}

/**
 * Throws when any field was refused.
 * @param issues Refused fields, from copyIssues.
 * @throws DomainError VALIDATION_FAILED with the issues by path.
 */
function assertNoIssues(issues: CopyIssue[]): void {
  if (issues.length > 0) {
    throw new DomainError('VALIDATION_FAILED', 'The email uses placeholders that are not allowed', {
      issues,
    });
  }
}

/**
 * Throws unless the actor holds the permission.
 * @param actor The signed-in admin.
 * @param permission Permission the action needs.
 * @throws DomainError FORBIDDEN
 */
function requirePermission(actor: AdminUser, permission: Permission): void {
  if (!can(actor.role, permission))
    throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
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
   * Validates an edited email in every language, then saves it. Turning off a store or admin email is a separate
   * permission: those emails tell the team about orders and stock, so an editor may change their copy but not stop them.
   * @param actor The signed-in admin.
   * @param key Notification key.
   * @param input Subject and body per language, and whether the email is sent.
   * @throws DomainError FORBIDDEN, or VALIDATION_FAILED when a placeholder is unknown or not allowed for the email.
   */
  async save(
    actor: AdminUser,
    key: NotificationKey,
    input: { subject: LocalizedText; body: LocalizedText; enabled: boolean },
  ): Promise<void> {
    requirePermission(actor, 'emails.edit');
    const definition = EMAIL_DEFINITIONS[key];
    if (!input.enabled && definition.audience !== 'customer') {
      requirePermission(actor, 'emails.disable_store_alerts');
    }
    assertNoIssues(
      SUPPORTED_LOCALES.flatMap((locale) =>
        copyIssues(definition, locale, { subject: input.subject[locale], body: input.body[locale] }),
      ),
    );
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
   * @param actor The signed-in admin.
   * @param key Notification key.
   * @throws DomainError FORBIDDEN
   */
  async restore(actor: AdminUser, key: NotificationKey): Promise<void> {
    requirePermission(actor, 'emails.edit');
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
   * @throws DomainError VALIDATION_FAILED when the copy uses a placeholder the email does not allow.
   */
  async preview(key: NotificationKey, locale: Locale, draft?: EmailCopy): Promise<RenderedEmail> {
    const definition = EMAIL_DEFINITIONS[key];
    const copy = draft ?? copyFor(await this.deps.templates.find(key), definition, locale);
    assertNoIssues(copyIssues(definition, locale, copy));
    const store = await loadStoreSection(this.deps.settings, this.deps.siteUrl);
    const context = { ...emptyContext(locale, store), ...(await this.sample(locale)), locale, store };
    return renderEmail(copy, context);
  }
}
