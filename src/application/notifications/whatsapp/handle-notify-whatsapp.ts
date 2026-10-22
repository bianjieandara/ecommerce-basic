// Delivers one queued WhatsApp message (the notify.whatsapp job). A message goes out only when WhatsApp is on in settings, the
// connection to Meta is set, the template is enabled and approved in the recipient's language. Anything else is logged as
// skipped, so the admin sees why a message did not go out. Failures are recorded and rethrown, so the queue retries them.
import type { JobHandler } from '../../jobs/dispatcher';
import type { SettingsRepository } from '../../ports/content';
import type { AttachmentLoader, NotificationLogRepository } from '../../ports/notifications';
import type { Clock } from '../../ports/platform';
import type {
  WhatsAppSender,
  WhatsAppTemplateConfig,
  WhatsAppTemplateMessage,
  WhatsAppTemplateRepository,
} from '../../ports/whatsapp';
import { defaultConfigOf, WHATSAPP_DEFINITIONS } from './index';
import {
  buttonSuffixOf,
  META_LANGUAGE,
  paramValues,
  renderBody,
  toMetaParam,
  valueAt,
} from './template-rules';
import { notifyWhatsappPayload, type NotifyWhatsappPayload } from './whatsapp-schemas';

/** Shortest and longest digit strings a WhatsApp number can have (with country code). */
const PHONE_DIGITS = /^\d{8,15}$/;

/** Longest text kept as the log subject of a sent message. */
const SUBJECT_CHARS = 200;

/** Dependencies of the WhatsApp delivery. */
export interface NotifyWhatsappDeps {
  templates: WhatsAppTemplateRepository;
  settings: SettingsRepository;
  logs: NotificationLogRepository;
  sender: WhatsAppSender;
  attachments: AttachmentLoader;
  clock: Clock;
  /** Reports a follow-up that failed after the message was already sent. Never throws. */
  report: (event: string, data: Record<string, unknown>) => void;
}

/**
 * The job handler of notify.whatsapp. Validates the payload, then delivers it.
 * Wire it as `'notify.whatsapp': handleNotifyWhatsapp(deps)` in buildJobHandlers.
 * @param deps Templates, settings, log, sender, attachments, clock and the reporter.
 * @returns A handler for the job payload.
 */
export function handleNotifyWhatsapp(deps: NotifyWhatsappDeps): JobHandler {
  return async (payload) => {
    await deliverWhatsApp(deps, notifyWhatsappPayload.parse(payload));
  };
}

/**
 * Sends one message, or records why it was skipped. Only a send that failed is rethrown.
 * @param deps Dependencies of the delivery.
 * @param job Validated payload.
 */
export async function deliverWhatsApp(deps: NotifyWhatsappDeps, job: NotifyWhatsappPayload): Promise<void> {
  const now = deps.clock.now().toISOString();
  const skip = (reason: string) => deps.logs.markSkipped(job.idempotencyKey, reason, now);

  const whatsapp = await deps.settings.get('whatsapp');
  if (!whatsapp.enabled) return skip('WhatsApp is turned off in settings');
  if (!deps.sender.isConfigured()) return skip('WhatsApp is not connected to Meta');
  if (!PHONE_DIGITS.test(job.to)) return skip('Invalid WhatsApp number');

  // A key without a stored row uses its default, which is disabled, so nothing goes out before the admin saves it.
  const config: WhatsAppTemplateConfig =
    (await deps.templates.find(job.key)) ?? defaultConfigOf(WHATSAPP_DEFINITIONS[job.key], now);
  if (!config.enabled) return skip('Template disabled by the store');
  const status = config.remoteStatus[job.locale]?.status ?? 'NOT_SUBMITTED';
  if (status !== 'APPROVED') return skip(`Template not approved for ${job.locale} (${status})`);

  const buttonSuffix = config.buttonPath ? buttonSuffixOf(valueAt(job.context, config.buttonPath)) : null;
  if (config.buttonPath && buttonSuffix === null) return skip('No link for the button');
  if (config.headerDocument && job.attachments.length === 0) return skip('No document to send');

  const bodyParams = paramValues(config.params, job.context).map(toMetaParam);
  const body = renderBody(config.body[job.locale], bodyParams);
  try {
    const document = config.headerDocument ? await uploadDocument(deps, job) : null;
    // The template's header needs the PDF; sending without it would be refused by Meta.
    if (config.headerDocument && !document) return skip('No PDF among the attachments');
    const message: WhatsAppTemplateMessage = {
      to: job.to,
      templateName: config.metaName,
      languageCode: META_LANGUAGE[job.locale],
      bodyParams,
      buttonSuffix,
      document,
    };
    const { messageId } = await deps.sender.sendTemplate(message);
    await recordSent(deps, job, messageId, body.slice(0, SUBJECT_CHARS), now);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await deps.logs.markFailed(job.idempotencyKey, reason, now);
    throw error;
  }
}

/**
 * Uploads the first PDF among the attachments, for a document header.
 * @param deps Dependencies of the delivery.
 * @param job Validated payload with the attachment references.
 * @returns The media id and file name for the message.
 */
async function uploadDocument(
  deps: NotifyWhatsappDeps,
  job: NotifyWhatsappPayload,
): Promise<{ mediaId: string; filename: string } | null> {
  const files = await deps.attachments.load(job.attachments);
  const pdf = files.find((file) => file.contentType === 'application/pdf');
  if (!pdf) return null;
  const { mediaId } = await deps.sender.uploadMedia(pdf);
  return { mediaId, filename: pdf.filename };
}

/**
 * Writes the sent status once Meta accepted the message. The message is already out, so a failure here is reported and
 * never retried: a retry would send it a second time.
 * @param deps Dependencies of the delivery.
 * @param job Validated payload.
 * @param messageId WhatsApp message id from Meta.
 * @param subject Short text of the message, for the log.
 * @param now Time of the send.
 */
async function recordSent(
  deps: NotifyWhatsappDeps,
  job: NotifyWhatsappPayload,
  messageId: string,
  subject: string,
  now: string,
): Promise<void> {
  try {
    await deps.logs.markSent(job.idempotencyKey, messageId, subject, now);
  } catch (error) {
    deps.report('whatsapp.log_update_failed', {
      key: job.key,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
