// Queues notifications. Use cases call notify() and nothing is sent here: each message gets a log row (unique per
// reference, so retries and replayed webhooks never send twice) and one job that the queue consumer delivers.
import type { Locale } from '@/domain/shared/locale';
import { emailAddress } from '../jobs/job-types';
import type { SettingsRepository } from '../ports/content';
import type { JobQueue } from '../ports/jobs';
import type { Clock, IdGenerator } from '../ports/platform';
import type { EmailAttachmentRef, NotificationKey, NotificationLogRepository } from '../ports/notifications';
import {
  emptyContext,
  loadStoreSection,
  type NotificationContext,
  type NotificationSections,
} from './context';
import { whatsappDefinitionOf, whatsappNumberFor, type WhatsAppRecipient } from './whatsapp-recipient';

/** Who receives a notification. Only the fields the channel needs are read. */
export interface NotificationRecipient extends WhatsAppRecipient {
  email?: string;
  locale: Locale;
}

/** One notification to queue. */
export interface NotifyInput {
  key: NotificationKey;
  /** Business reference (order id, message id, ...). With the key and the recipient it makes the notification idempotent. */
  reference: string;
  recipient: NotificationRecipient;
  orderId?: string | null;
  context?: NotificationSections;
  /** Files to attach when the message is sent (read at that time, not when queued). */
  attachments?: EmailAttachmentRef[];
}

/** Dependencies of the notification service. */
export interface NotificationServiceDeps {
  settings: SettingsRepository;
  logs: NotificationLogRepository;
  jobs: JobQueue;
  clock: Clock;
  ids: IdGenerator;
  siteUrl: string;
}

/** Queues notifications for delivery by the queue consumer. */
export class NotificationService {
  /** @param deps Settings, log, job queue, clock, ids and the site URL. */
  constructor(private readonly deps: NotificationServiceDeps) {}

  /**
   * Queues one notification on every channel that applies. A repeat of the same key, reference and recipient is ignored.
   * The WhatsApp branch never fails the call: the email is already queued by then, and a WhatsApp problem is logged.
   * @param input What to send and to whom.
   * @returns Log ids of the messages queued by this call.
   */
  async notify(input: NotifyInput): Promise<{ logIds: string[] }> {
    const { recipient } = input;
    const store = await loadStoreSection(this.deps.settings, this.deps.siteUrl);
    const context: NotificationContext = {
      ...emptyContext(recipient.locale, store),
      ...input.context,
      locale: recipient.locale,
      store,
    };
    const now = this.deps.clock.now().toISOString();

    const emailIds = await this.queueEmail(input, context, now);
    const whatsappIds = await this.queueWhatsApp(input, context, now);
    return { logIds: [...emailIds, ...whatsappIds] };
  }

  /**
   * Queues the email of a notification. An invalid or missing address is logged as skipped.
   * @param input The notification.
   * @param context Context the email renders from.
   * @param nowIso Time of queuing.
   * @returns Log ids queued (empty for a duplicate or a skipped address).
   */
  private async queueEmail(
    input: NotifyInput,
    context: NotificationContext,
    nowIso: string,
  ): Promise<string[]> {
    const { recipient } = input;
    const address = recipient.email ?? '';
    const idempotencyKey = [input.key, input.reference, 'email', address || 'none'].join(':');
    const logId = this.deps.ids.newId();
    const { inserted } = await this.deps.logs.createQueued({
      id: logId,
      idempotencyKey,
      channel: 'email',
      templateKey: input.key,
      recipient: address,
      subject: null,
      orderId: input.orderId ?? null,
      createdAt: nowIso,
    });
    if (!inserted) return [];
    if (!emailAddress.safeParse(address).success) {
      await this.deps.logs.markSkipped(
        idempotencyKey,
        address ? 'Invalid email address' : 'No email address',
        nowIso,
      );
      return [];
    }

    await this.deps.jobs.enqueue(
      'notify.email',
      {
        idempotencyKey,
        key: input.key,
        locale: recipient.locale,
        to: address,
        context,
        attachments: input.attachments ?? [],
      },
      { idempotencyKey },
    );
    return [logId];
  }

  /**
   * Queues the WhatsApp message of a notification when the key has one, WhatsApp is on in settings and the recipient has a
   * usable number (and opted in, for customers). Whether the template is approved is checked by the job, which logs a skip
   * otherwise. Any failure here is logged and swallowed, because the email path must not depend on it.
   * @param input The notification.
   * @param context Context the message fills its parameters from.
   * @param nowIso Time of queuing.
   * @returns Log ids queued (empty when nothing applies or the queuing failed).
   */
  private async queueWhatsApp(
    input: NotifyInput,
    context: NotificationContext,
    nowIso: string,
  ): Promise<string[]> {
    const definition = whatsappDefinitionOf(input.key);
    if (!definition) return [];
    try {
      // The settings group is read once per call; the same value decides the number and the on/off switch.
      const whatsapp = await this.deps.settings.get('whatsapp');
      if (!whatsapp.enabled) return [];
      const to = whatsappNumberFor(definition, input.recipient, whatsapp);
      if (!to) return [];

      const idempotencyKey = [input.key, input.reference, 'whatsapp', to].join(':');
      const logId = this.deps.ids.newId();
      const { inserted } = await this.deps.logs.createQueued({
        id: logId,
        idempotencyKey,
        channel: 'whatsapp',
        templateKey: input.key,
        recipient: to,
        subject: null,
        orderId: input.orderId ?? null,
        createdAt: nowIso,
      });
      if (!inserted) return [];

      try {
        await this.deps.jobs.enqueue(
          'notify.whatsapp',
          {
            idempotencyKey,
            key: input.key,
            locale: input.recipient.locale,
            to,
            context,
            attachments: input.attachments ?? [],
          },
          { idempotencyKey },
        );
      } catch (error) {
        // The row would otherwise stay queued with no job behind it. Marked failed, the admin log offers a retry.
        await this.deps.logs.markFailed(idempotencyKey, 'Could not queue the WhatsApp job', nowIso);
        throw error;
      }
      return [logId];
    } catch (error) {
      console.error('notification.whatsapp_queue_failed', {
        key: input.key,
        reference: input.reference,
        error: String(error),
      });
      return [];
    }
  }
}
