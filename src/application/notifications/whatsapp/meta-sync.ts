// Submitting WhatsApp templates to Meta and syncing their review status back. Submit creates one template per language that
// Meta does not know yet, under the same name; sync reads the statuses. Both run from the admin screen, one language at a time,
// and record each language's outcome instead of stopping at the first failure.
import { assertNotDemoAccount } from '@/domain/demo/demo-account';
import { DomainError } from '@/domain/shared/errors';
import { SUPPORTED_LOCALES, type Locale } from '@/domain/shared/locale';
import type { SettingsRepository } from '../../ports/content';
import type { AdminUser } from '../../ports/identity';
import type { Clock } from '../../ports/platform';
import {
  templateStatusFrom,
  type MetaTemplateDraft,
  type MetaTemplateRecord,
  type WhatsAppKey,
  type WhatsAppRemoteStatus,
  type WhatsAppTemplateCatalog,
  type WhatsAppTemplateConfig,
  type WhatsAppTemplateRepository,
} from '../../ports/whatsapp';
import { WHATSAPP_DEFINITIONS, defaultConfigOf } from './index';
import { assertWhatsAppAdmin } from './owner-only';
import { sampleWhatsAppContext } from './sample-context';
import {
  bodyIssues,
  buttonSuffixOf,
  META_LANGUAGE,
  paramValues,
  toMetaParam,
  valueAt,
} from './template-rules';
import type { SubmitLanguageResult } from './view-model';

/** Dependencies of the Meta sync. */
export interface WhatsAppMetaSyncDeps {
  templates: WhatsAppTemplateRepository;
  settings: SettingsRepository;
  catalog: WhatsAppTemplateCatalog;
  clock: Clock;
  siteUrl: string;
}

/** Result of a submit: the statuses now stored, and what happened per language. */
export interface SubmitResult {
  remoteStatus: WhatsAppRemoteStatus;
  results: SubmitLanguageResult[];
}

/** Submits and syncs WhatsApp templates. Owners only. */
export class WhatsAppMetaSync {
  /** @param deps Templates, settings, the Meta catalog, the clock and the site URL. */
  constructor(private readonly deps: WhatsAppMetaSyncDeps) {}

  /**
   * Creates the template in Meta for every language that has none under this name. Languages that already exist are only
   * read. A failing language is recorded and the others still go out.
   * @param actor The signed-in admin.
   * @param key Message key.
   * @returns The stored statuses and the outcome per language.
   * @throws DomainError FORBIDDEN, or INVALID_STATE when Meta is not connected.
   */
  async submit(actor: AdminUser, key: WhatsAppKey): Promise<SubmitResult> {
    assertNotDemoAccount(actor);
    assertWhatsAppAdmin(actor);
    this.requireConnected();
    const config = await this.loadConfig(key);
    const known = await this.deps.catalog.findByName(config.metaName);
    const now = this.deps.clock.now().toISOString();

    const remote: WhatsAppRemoteStatus = {};
    const results: SubmitLanguageResult[] = [];
    for (const locale of SUPPORTED_LOCALES) {
      const existing = known.find((record) => record.languageCode === META_LANGUAGE[locale]);
      if (existing) {
        remote[locale] = {
          status: templateStatusFrom(existing.status),
          reason: existing.reason,
          syncedAt: now,
        };
        results.push({ locale, outcome: 'already_exists', reason: null, detail: null });
        continue;
      }
      if (bodyIssues(config.body[locale], config.params.length).length > 0) {
        remote[locale] = { status: 'NOT_SUBMITTED', reason: 'BODY_INVALID', syncedAt: now };
        results.push({ locale, outcome: 'failed', reason: 'BODY_INVALID', detail: null });
        continue;
      }
      try {
        const draft = await this.draftFor(config, locale);
        const created = await this.deps.catalog.create(draft);
        remote[locale] = { status: templateStatusFrom(created.status), reason: null, syncedAt: now };
        results.push({ locale, outcome: 'submitted', reason: null, detail: null });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        remote[locale] = { status: 'NOT_SUBMITTED', reason: detail, syncedAt: now };
        results.push({ locale, outcome: 'failed', reason: 'PROVIDER', detail });
      }
    }
    const remoteStatus = await this.deps.templates.saveRemoteStatus(key, remote);
    return { remoteStatus, results };
  }

  /**
   * Reads the review status of the template from Meta. A language Meta does not know is recorded as not submitted.
   * @param actor The signed-in admin.
   * @param key Message key.
   * @returns The stored statuses.
   * @throws DomainError FORBIDDEN, or INVALID_STATE when Meta is not connected.
   */
  async sync(actor: AdminUser, key: WhatsAppKey): Promise<WhatsAppRemoteStatus> {
    assertWhatsAppAdmin(actor);
    this.requireConnected();
    const config = await this.loadConfig(key);
    const records = await this.deps.catalog.findByName(config.metaName);
    const now = this.deps.clock.now().toISOString();
    const remote: WhatsAppRemoteStatus = {};
    for (const locale of SUPPORTED_LOCALES) {
      remote[locale] = statusOf(records, locale, now);
    }
    return this.deps.templates.saveRemoteStatus(key, remote);
  }

  /**
   * Throws unless Meta is connected, so the admin sees the reason instead of a failed call.
   * @throws DomainError INVALID_STATE with reason NOT_CONNECTED.
   */
  private requireConnected(): void {
    if (!this.deps.catalog.isConfigured()) {
      throw new DomainError('INVALID_STATE', 'WhatsApp is not connected to Meta.', {
        reason: 'NOT_CONNECTED',
      });
    }
  }

  /**
   * The stored config of a key, seeded from its default when no row exists yet.
   * @param key Message key.
   */
  private async loadConfig(key: WhatsAppKey): Promise<WhatsAppTemplateConfig> {
    const now = this.deps.clock.now().toISOString();
    const definition = WHATSAPP_DEFINITIONS[key];
    await this.deps.templates.seedMissing([defaultConfigOf(definition, now)]);
    return (await this.deps.templates.find(key)) ?? defaultConfigOf(definition, now);
  }

  /**
   * The creation request for one language: body with its examples, and the URL button with its example link.
   * @param config Stored config.
   * @param locale Language to create.
   */
  private async draftFor(config: WhatsAppTemplateConfig, locale: Locale): Promise<MetaTemplateDraft> {
    const sample = await sampleWhatsAppContext(this.deps.settings, this.deps.siteUrl, locale);
    const origin = new URL(this.deps.siteUrl).origin;
    const definition = WHATSAPP_DEFINITIONS[config.key];
    const link = config.buttonPath ? valueAt(sample, config.buttonPath) : '';
    return {
      name: config.metaName,
      languageCode: META_LANGUAGE[locale],
      bodyText: config.body[locale].trim(),
      bodyExamples: paramValues(config.params, sample).map(toMetaParam),
      button:
        config.buttonPath && definition.buttonLabel && buttonSuffixOf(link) !== null
          ? { label: definition.buttonLabel[locale], baseUrl: `${origin}/`, example: link }
          : null,
      documentHeader: config.headerDocument,
    };
  }
}

/**
 * The stored status of one language, taken from the records Meta returned for the template name.
 * @param records Records Meta returned, all languages.
 * @param locale Language to read.
 * @param now Time of the sync.
 */
function statusOf(records: MetaTemplateRecord[], locale: Locale, now: string) {
  const record = records.find((item) => item.languageCode === META_LANGUAGE[locale]);
  if (!record) return { status: 'NOT_SUBMITTED' as const, reason: null, syncedAt: now };
  return { status: templateStatusFrom(record.status), reason: record.reason, syncedAt: now };
}
