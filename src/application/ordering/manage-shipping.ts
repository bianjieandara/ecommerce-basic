// Admin changes to the checkout shipping methods: save one method (new or existing) and delete one. The pickup rule lives here,
// so every caller stores the same prices.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../ports/identity';
import type { ShippingMethodRecord, ShippingMethodRepository } from '../ports/ordering';
import type { IdGenerator } from '../ports/platform';
import type { ShippingMethodInput } from './shipping-schemas';

/** Dependencies of the shipping administration. */
export interface ManageShippingDeps {
  shipping: ShippingMethodRepository;
  ids: IdGenerator;
}

/** Creates, updates and deletes checkout shipping methods. */
export class ManageShipping {
  /** @param deps Shipping repository and id generator. */
  constructor(private readonly deps: ManageShippingDeps) {}

  /**
   * Stores a method. A pickup is free by definition, so its price and threshold are stored as zero and null whatever was sent.
   * @param actor The signed-in admin.
   * @param input The method as the admin saved it.
   * @returns The id of the stored method.
   * @throws DomainError FORBIDDEN, or NOT_FOUND when the input names a method that does not exist.
   */
  async save(actor: AdminUser, input: ShippingMethodInput): Promise<{ id: string }> {
    requireEdit(actor);
    // The table is small, so one read answers the existence check; a row is never written under an id the admin did not get.
    if (input.id !== undefined) await this.requireMethod(input.id);
    const pickup = input.kind === 'pickup';
    const record: ShippingMethodRecord = {
      id: input.id ?? this.deps.ids.newId(),
      kind: input.kind,
      name: input.name,
      description: input.description,
      priceMinor: pickup ? 0 : input.priceMinor,
      freeOverMinor: pickup ? null : input.freeOverMinor,
      isActive: input.isActive,
      position: input.position,
    };
    await this.deps.shipping.save(record);
    return { id: record.id };
  }

  /**
   * Deletes a method. Orders keep their own copy of the method's name, so past orders are unaffected.
   * @param actor The signed-in admin.
   * @param id Method to delete.
   * @throws DomainError FORBIDDEN, or NOT_FOUND when the method does not exist.
   */
  async remove(actor: AdminUser, id: string): Promise<void> {
    requireEdit(actor);
    await this.requireMethod(id);
    await this.deps.shipping.delete(id);
  }

  /**
   * Checks that a method exists.
   * @param id Method id.
   * @throws DomainError NOT_FOUND when no method has the id.
   */
  private async requireMethod(id: string): Promise<void> {
    const methods = await this.deps.shipping.listAll();
    if (!methods.some((method) => method.id === id))
      throw new DomainError('NOT_FOUND', 'Shipping method not found');
  }
}

/**
 * Refuses the change unless the actor may edit content.
 * @param actor The signed-in admin.
 * @throws DomainError FORBIDDEN
 */
function requireEdit(actor: AdminUser): void {
  if (!can(actor.role, 'settings.manage')) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
  }
}
