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

/** Who receives a notification. Only the fields the channel needs are read. */
export interface NotificationRecipient {
  email?: string;
  phone?: string;
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
  /** Files to attach when the email is sent (read at that time, not when queued). */
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
   * Queues one notification. A repeat of the same key, reference and recipient is ignored.
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
    const address = recipient.email ?? '';

    // Email is the only channel for now. WhatsApp joins here in Stage 18, after template approval and opt-in checks.
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
      createdAt: now,
    });
    if (!inserted) return { logIds: [] };
    if (!emailAddress.safeParse(address).success) {
      await this.deps.logs.markSkipped(
        idempotencyKey,
        address ? 'Invalid email address' : 'No email address',
        now,
      );
      return { logIds: [] };
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
    return { logIds: [logId] };
  }
}
