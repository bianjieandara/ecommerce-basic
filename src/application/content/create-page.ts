// Creates a custom page. Its address must be free, and the system pages keep their own addresses.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import { isSystemPageSlug, type Page } from '@/domain/content/page';
import type { PageRepository } from '../ports/content';
import type { AdminUser } from '../ports/identity';
import type { Clock, IdGenerator } from '../ports/platform';
import type { CreatePageInput } from './page-schemas';

/** Dependencies of the page creation. */
export interface CreatePageDeps {
  pages: PageRepository;
  clock: Clock;
  ids: IdGenerator;
}

/** Creates a custom page, unpublished and without sections. */
export class CreatePage {
  /** @param deps Page repository, clock and id generator. */
  constructor(private readonly deps: CreatePageDeps) {}

  /**
   * Stores the new page.
   * @param actor The signed-in admin.
   * @param input Address and title.
   * @returns The id of the new page.
   * @throws DomainError FORBIDDEN, or CONFLICT when the address is taken.
   */
  async execute(actor: AdminUser, input: CreatePageInput): Promise<{ id: string }> {
    if (!can(actor.role, 'content.edit')) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
    }
    if (isSystemPageSlug(input.slug) || (await this.deps.pages.findBySlug(input.slug))) {
      throw new DomainError('CONFLICT', 'That address is already used by a page');
    }
    const page: Page = {
      id: this.deps.ids.newId(),
      slug: input.slug,
      kind: 'custom',
      title: input.title,
      seoTitle: {},
      seoDescription: {},
      sections: [],
      isPublished: false,
      updatedAt: this.deps.clock.now().toISOString(),
    };
    await this.deps.pages.save(page);
    return { id: page.id };
  }
}
