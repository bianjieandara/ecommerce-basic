// SubmitContactMessage: stores a contact form message, then queues the store alert and the sender's auto-reply. Nothing is
// sent inline, so the form answers at once. A filled honeypot gets the same success answer and stores nothing.
import { DomainError } from '@/domain/shared/errors';
import type { ContactMessageRepository, SettingsRepository } from '../ports/content';
import type { BotVerifier, Clock, IdGenerator } from '../ports/platform';
import type { NotificationService } from '../notifications/notification-service';
import type { ContactMessageInput } from './contact-schemas';

/** Dependencies of SubmitContactMessage. */
export interface SubmitContactMessageDeps {
  messages: ContactMessageRepository;
  settings: SettingsRepository;
  notifications: NotificationService;
  botVerifier: BotVerifier;
  clock: Clock;
  ids: IdGenerator;
}

/** Stores contact messages and queues their notifications. */
export class SubmitContactMessage {
  /** @param deps Repositories, settings, notifications and the bot check. */
  constructor(private readonly deps: SubmitContactMessageDeps) {}

  /**
   * Stores a message and queues the store alert and the auto-reply.
   * @param input Parsed form request.
   * @param client Client IP, used by the bot check.
   * @returns The stored message id, or null for a filled honeypot.
   * @throws DomainError BOT_CHECK_FAILED when the Turnstile check fails.
   */
  async execute(input: ContactMessageInput, client: { ip: string | null }): Promise<{ id: string | null }> {
    if (input.website !== '') return { id: null };
    if (!(await this.deps.botVerifier.verify(input.turnstileToken, client.ip))) {
      throw new DomainError('BOT_CHECK_FAILED', 'The security check failed');
    }
    const [general, contact] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('contact'),
    ]);
    const id = this.deps.ids.newId();
    const phone = input.phone === '' ? null : input.phone;
    await this.deps.messages.create({
      id,
      name: input.name,
      email: input.email,
      phone,
      message: input.message,
      locale: input.locale,
      isRead: false,
      createdAt: this.deps.clock.now().toISOString(),
    });
    await this.deps.notifications.notify({
      key: 'contact_message_store',
      reference: id,
      recipient: { email: contact.email, locale: general.defaultLocale },
      context: {
        contact: { name: input.name, email: input.email, phone: phone ?? '', message: input.message },
      },
    });
    await this.deps.notifications.notify({
      key: 'contact_autoreply',
      reference: id,
      recipient: { email: input.email, locale: input.locale },
      context: {
        customer: {
          firstName: input.name.split(' ')[0] ?? input.name,
          fullName: input.name,
          email: input.email,
          phone: phone ?? '',
        },
      },
    });
    return { id };
  }
}
