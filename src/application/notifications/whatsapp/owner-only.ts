// The WhatsApp administration belongs to owners: templates are approved by Meta under the store's name, and a wrong body or
// mapping reaches customers. Editors do not see it; the use cases check the same permission as the page does.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../../ports/identity';

/**
 * Throws unless the admin may manage WhatsApp templates.
 * @param actor The signed-in admin.
 * @throws DomainError FORBIDDEN for anyone but an owner.
 */
export function assertWhatsAppAdmin(actor: AdminUser): void {
  if (!can(actor.role, 'settings.manage')) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
  }
}
