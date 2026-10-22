// Deletes a custom page. The system pages every store has cannot be deleted; their sections can be changed instead.
import { can } from '@/domain/identity/role';
import { isSystemPageSlug } from '@/domain/content/page';
import { DomainError } from '@/domain/shared/errors';
import type { PageRepository } from '../ports/content';
import type { AdminUser } from '../ports/identity';

/** Dependencies of the page deletion. */
export interface DeletePageDeps {
  pages: PageRepository;
}

/** Deletes a custom page. */
export class DeletePage {
  /** @param deps Page repository. */
  constructor(private readonly deps: DeletePageDeps) {}

  /**
   * Removes the page.
   * @param actor The signed-in admin.
   * @param id Page to delete.
   * @throws DomainError FORBIDDEN, NOT_FOUND, or INVALID_STATE for a system page.
   */
  async execute(actor: AdminUser, id: string): Promise<void> {
    if (!can(actor.role, 'content.edit')) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
    }
    // A system slug is refused even before it has a row: the store always has its system pages.
    if (isSystemPageSlug(id)) throw new DomainError('INVALID_STATE', 'System pages cannot be deleted');
    const page = await this.deps.pages.findById(id);
    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
    if (page.kind === 'system') throw new DomainError('INVALID_STATE', 'System pages cannot be deleted');
    await this.deps.pages.delete(id);
  }
}
