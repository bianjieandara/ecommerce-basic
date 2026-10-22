// WhatsApp template administration: the overview for the screen, saving a template's body, mapping and enabled flag, and a test
// message to the admin's own phone. Submitting to Meta and syncing statuses live in whatsapp/meta-sync.ts.
import { DomainError } from '@/domain/shared/errors';
import { SUPPORTED_LOCALES } from '@/domain/shared/locale';
import { normalizePhone } from '@/domain/shared/phone';
import type { SettingsRepository } from '../ports/content';
import type { AdminUser } from '../ports/identity';
import type { NotificationLogRepository } from '../ports/notifications';
import type { JobQueue } from '../ports/jobs';
import type { Clock, IdGenerator } from '../ports/platform';
import {
  WHATSAPP_KEYS,
  type WhatsAppConnection,
  type WhatsAppKey,
  type WhatsAppTemplateConfig,
  type WhatsAppTemplateRepository,
} from '../ports/whatsapp';
import { defaultConfigOf, WHATSAPP_DEFINITIONS } from './whatsapp';
import { assertWhatsAppAdmin } from './whatsapp/owner-only';
import { sampleWhatsAppContext } from './whatsapp/sample-context';
import { isApproved, type WhatsAppOverview, type WhatsAppTemplateEntry } from './whatsapp/view-model';
import { bodyIssues } from './whatsapp/template-rules';
import type { SaveWhatsAppInput } from './whatsapp/whatsapp-schemas';

/** Dependencies of the template administration. */
export interface WhatsAppTemplateServiceDeps {
  templates: WhatsAppTemplateRepository;
  settings: SettingsRepository;
  connection: WhatsAppConnection;
  logs: NotificationLogRepository;
  jobs: JobQueue;
  clock: Clock;
  ids: IdGenerator;
  siteUrl: string;
}

/** Template use cases of the WhatsApp admin screen. Owners only. */
export class WhatsAppTemplateService {
  /** @param deps Templates, settings, connection status, log, jobs, clock, ids and the site URL. */
  constructor(private readonly deps: WhatsAppTemplateServiceDeps) {}

  /**
   * Every message with its stored config (or its default), and the connection flags.
   * @param actor The signed-in admin.
   * @throws DomainError FORBIDDEN for anyone but an owner.
   */
  async overview(actor: AdminUser): Promise<WhatsAppOverview> {
    assertWhatsAppAdmin(actor);
    const now = this.deps.clock.now().toISOString();
    await this.deps.templates.seedMissing(
      WHATSAPP_KEYS.map((key) => defaultConfigOf(WHATSAPP_DEFINITIONS[key], now)),
    );
    const byKey = new Map((await this.deps.templates.list()).map((config) => [config.key, config]));
    const entries: WhatsAppTemplateEntry[] = WHATSAPP_KEYS.map((key) => {
      const definition = WHATSAPP_DEFINITIONS[key];
      const config = byKey.get(key) ?? defaultConfigOf(definition, now);
      return {
        key,
        audience: definition.audience,
        config,
        readOnly: isApproved(config),
        buttonLabel: definition.buttonLabel,
      };
    });
    return { connection: this.deps.connection.status(), entries };
  }

  /**
   * Saves a template. Approved content is read only: changing the body or the mapping needs a new Meta name, which starts a
   * new template for review. The body is checked against the parameters in every language before it is stored.
   * @param actor The signed-in admin.
   * @param key Message key.
   * @param input Meta name, body per language, parameter mapping, button and enabled flag.
   * @returns The config as stored.
   * @throws DomainError FORBIDDEN, VALIDATION_FAILED (body or button) or INVALID_STATE (approved content).
   */
  async save(actor: AdminUser, key: WhatsAppKey, input: SaveWhatsAppInput): Promise<WhatsAppTemplateConfig> {
    assertWhatsAppAdmin(actor);
    const definition = WHATSAPP_DEFINITIONS[key];
    const now = this.deps.clock.now().toISOString();
    const current = (await this.deps.templates.find(key)) ?? defaultConfigOf(definition, now);
    const nameChanged = input.metaName !== current.metaName;

    if (!nameChanged && isApproved(current) && contentDiffers(current, input)) {
      throw new DomainError('INVALID_STATE', 'Approved templates are read-only.', {
        reason: 'APPROVED_READ_ONLY',
      });
    }
    if (input.buttonPath !== null && definition.buttonLabel === null) {
      throw new DomainError('VALIDATION_FAILED', 'This message has no button.', { reason: 'NO_BUTTON' });
    }
    const issues = SUPPORTED_LOCALES.flatMap((locale) =>
      bodyIssues(input.body[locale], input.params.length).map((reason) => ({
        path: `body.${locale}`,
        reason,
      })),
    );
    if (issues.length > 0) {
      throw new DomainError('VALIDATION_FAILED', 'The body does not match its parameters.', { issues });
    }

    // A new name is a new template in Meta, so the statuses of the old one no longer apply.
    return this.deps.templates.save({
      key,
      metaName: input.metaName,
      enabled: input.enabled,
      body: { es: input.body.es.trim(), en: input.body.en.trim() },
      params: input.params,
      buttonPath: input.buttonPath,
      headerDocument: definition.headerDocument,
      remoteStatus: nameChanged ? {} : current.remoteStatus,
      updatedAt: now,
    });
  }

  /**
   * Queues a test message with sample values to the admin's own phone. It goes through the same job and log as a real
   * message, so the notification log shows whether it was sent or skipped, and why.
   * @param actor The signed-in admin; the phone comes from the account.
   * @param key Message key.
   * @returns The log row of the test.
   * @throws DomainError FORBIDDEN, or VALIDATION_FAILED with reason NO_PHONE when the account has no usable number.
   */
  async sendTest(actor: AdminUser, key: WhatsAppKey): Promise<{ logId: string }> {
    assertWhatsAppAdmin(actor);
    const whatsapp = await this.deps.settings.get('whatsapp');
    const to = normalizePhone(actor.phone ?? '', whatsapp.defaultCountryCode);
    if (!to)
      throw new DomainError('VALIDATION_FAILED', 'The account has no usable phone number.', {
        reason: 'NO_PHONE',
      });

    const context = await sampleWhatsAppContext(this.deps.settings, this.deps.siteUrl, actor.locale);
    const now = this.deps.clock.now().toISOString();
    const logId = this.deps.ids.newId();
    const idempotencyKey = `${key}:test:${logId}`;
    await this.deps.logs.createQueued({
      id: logId,
      idempotencyKey,
      channel: 'whatsapp',
      templateKey: key,
      recipient: to,
      subject: null,
      orderId: null,
      createdAt: now,
    });
    await this.deps.jobs.enqueue(
      'notify.whatsapp',
      { idempotencyKey, key, locale: actor.locale, to, context, attachments: [] },
      { idempotencyKey },
    );
    return { logId };
  }
}

/**
 * Whether the submitted content differs from the stored one: body, parameters or button.
 * @param current Stored config.
 * @param input Submitted values.
 * @returns True when a field the approved template depends on has changed.
 */
function contentDiffers(current: WhatsAppTemplateConfig, input: SaveWhatsAppInput): boolean {
  return (
    current.body.es.trim() !== input.body.es.trim() ||
    current.body.en.trim() !== input.body.en.trim() ||
    current.params.join('|') !== input.params.join('|') ||
    current.buttonPath !== input.buttonPath
  );
}
