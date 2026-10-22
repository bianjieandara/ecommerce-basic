// Saves and removes testimonials from the admin list. The storefront widget shows only the visible ones.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { Testimonial, TestimonialRepository } from '../ports/content';
import type { AdminUser } from '../ports/identity';
import type { Clock, IdGenerator } from '../ports/platform';
import type { TestimonialInput } from './testimonial-schemas';

/** Dependencies of the testimonial management. */
export interface ManageTestimonialsDeps {
  testimonials: TestimonialRepository;
  ids: IdGenerator;
  clock: Clock;
}

/** Creates, updates and deletes testimonials. */
export class ManageTestimonials {
  /** @param deps Testimonial repository, id generator and clock. */
  constructor(private readonly deps: ManageTestimonialsDeps) {}

  /**
   * Stores a testimonial. An id that does not exist is refused rather than created under that id, because the client only
   * sends ids it read from the list.
   * @param actor The signed-in admin.
   * @param input Testimonial from the form.
   * @returns The id of the saved testimonial.
   * @throws DomainError FORBIDDEN, or NOT_FOUND for an unknown id.
   */
  async save(actor: AdminUser, input: TestimonialInput): Promise<{ id: string }> {
    if (!can(actor.role, 'content.edit')) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
    }
    const existing = input.id ? await this.deps.testimonials.findById(input.id) : null;
    if (input.id && !existing) throw new DomainError('NOT_FOUND', 'Testimonial not found');
    const testimonial: Testimonial = {
      id: existing?.id ?? this.deps.ids.newId(),
      authorName: input.authorName,
      rating: input.rating,
      body: input.body,
      locale: input.locale,
      isVisible: input.isVisible,
      position: input.position,
      createdAt: existing?.createdAt ?? this.deps.clock.now().toISOString(),
    };
    await this.deps.testimonials.save(testimonial);
    return { id: testimonial.id };
  }

  /**
   * Removes a testimonial.
   * @param actor The signed-in admin.
   * @param id Testimonial to delete.
   * @throws DomainError FORBIDDEN, or NOT_FOUND.
   */
  async remove(actor: AdminUser, id: string): Promise<void> {
    if (!can(actor.role, 'content.edit')) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
    }
    if (!(await this.deps.testimonials.findById(id)))
      throw new DomainError('NOT_FOUND', 'Testimonial not found');
    await this.deps.testimonials.delete(id);
  }
}
