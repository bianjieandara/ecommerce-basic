// MarkMessageRead: marks a contact message as read, so the inbox shows what is still open.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { ContactMessageRepository } from '../ports/content';
import type { AdminUser } from '../ports/identity';

/** Dependencies of MarkMessageRead. */
export interface MarkMessageReadDeps {
  messages: ContactMessageRepository;
}

/** Marks one contact message as read. */
export class MarkMessageRead {
  /** @param deps Contact message storage. */
  constructor(private readonly deps: MarkMessageReadDeps) {}

  /**
   * @param actor Signed-in admin. Editors and owners read the inbox.
   * @param messageId Contact message id.
   * @throws DomainError FORBIDDEN for an admin without the permission.
   */
  async execute(actor: AdminUser, messageId: string): Promise<void> {
    if (!can(actor.role, 'orders.manage'))
      throw new DomainError('FORBIDDEN', 'You cannot read customer messages');
    await this.deps.messages.markRead(messageId);
  }
}
