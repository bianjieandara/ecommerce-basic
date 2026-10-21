// Delivers one queued email (the notify.email job). Renders the admin override or the code default, sends it through the
// EmailSender port and records the outcome in the notification log. Attachments are read here, at send time.
import type { NotifyEmailPayload } from '../jobs/job-types';
import type {
  AttachmentLoader,
  EmailTemplateRepository,
  NotificationLogRepository,
} from '../ports/notifications';
import type { Clock, EmailSender } from '../ports/platform';
import { EMAIL_DEFINITIONS } from './email';
import { copyFor, renderEmail } from './render-email';

/** Dependencies of the email delivery. */
export interface SendNotificationEmailDeps {
  templates: EmailTemplateRepository;
  logs: NotificationLogRepository;
  sender: EmailSender;
  clock: Clock;
  attachments: AttachmentLoader;
}

/** Sends queued notification emails. */
export class SendNotificationEmail {
  /** @param deps Template overrides, the log, the sender, the clock and the attachment loader. */
  constructor(private readonly deps: SendNotificationEmailDeps) {}

  /**
   * Sends one email. A failure is logged and rethrown, so the queue retries it. A permanent error is recorded in
   * failed_jobs once the retries stop.
   * @param job Validated job payload.
   */
  async execute(job: NotifyEmailPayload): Promise<void> {
    const now = this.deps.clock.now().toISOString();
    const override = await this.deps.templates.find(job.key);
    if (override && !override.enabled) {
      await this.deps.logs.markSkipped(job.idempotencyKey, 'Template disabled by the store', now);
      return;
    }
    try {
      const copy = copyFor(override, EMAIL_DEFINITIONS[job.key], job.locale);
      const email = renderEmail(copy, job.context);
      const attachments = job.attachments.length > 0 ? await this.deps.attachments.load(job.attachments) : [];
      const { messageId } = await this.deps.sender.send({
        to: job.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments,
      });
      await this.deps.logs.markSent(job.idempotencyKey, messageId, email.subject, now);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.deps.logs.markFailed(job.idempotencyKey, reason, now);
      throw error;
    }
  }
}
