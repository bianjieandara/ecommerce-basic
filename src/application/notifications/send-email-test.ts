// Sends one email to the signed-in admin with sample data, so an editor sees the saved copy in a real inbox. It goes through
// the normal queue, and the reference is unique per call, so a test never blocks a real message of the same email.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../ports/identity';
import type { NotificationKey } from '../ports/notifications';
import type { IdGenerator } from '../ports/platform';
import type { EmailTemplateService } from './email-template-service';
import type { NotificationService } from './notification-service';

/** Dependencies of the test send. */
export interface SendEmailTestDeps {
  templates: EmailTemplateService;
  notifications: NotificationService;
  ids: IdGenerator;
}

/** Queues a test copy of one email to the admin who asks for it. */
export class SendEmailTest {
  /** @param deps Template service, notification service and id generator. */
  constructor(private readonly deps: SendEmailTestDeps) {}

  /**
   * Queues the email with sample data, to the admin's own address and language.
   * @param actor The signed-in admin; the test goes to this address.
   * @param key Email to test.
   * @returns Log ids of the message queued by this call.
   * @throws DomainError FORBIDDEN
   */
  async execute(actor: AdminUser, key: NotificationKey): Promise<{ logIds: string[] }> {
    if (!can(actor.role, 'emails.edit')) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
    }
    return this.deps.notifications.notify({
      key,
      reference: `test:${this.deps.ids.newId()}`,
      recipient: { email: actor.email, locale: actor.locale },
      context: await this.deps.templates.sample(actor.locale),
    });
  }
}
