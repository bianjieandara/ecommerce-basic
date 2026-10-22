// IssueOrderInvoice: an owner or editor issues the invoice of a paid order by hand, for a store that does not issue on payment.
// Issuing again returns the invoice the order already has.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../ports/identity';
import type { Invoice } from '../ports/invoicing';
import type { OrderRepository } from '../ports/ordering';
import type { IssueInvoice } from './issue-invoice';

/** Dependencies of IssueOrderInvoice. */
export interface IssueOrderInvoiceDeps {
  orders: OrderRepository;
  issueInvoice: IssueInvoice;
}

/** Issues the invoice of an order from the admin screens. */
export class IssueOrderInvoice {
  /** @param deps The order lookup and the invoice use case. */
  constructor(private readonly deps: IssueOrderInvoiceDeps) {}

  /**
   * Issues the invoice of an order, or returns the invoice it has.
   * @param actor Signed-in admin. Owners and editors both change orders, so both may issue invoices.
   * @param number Order number.
   * @returns The invoice.
   * @throws DomainError FORBIDDEN, NOT_FOUND, or INVALID_STATE when the order is unpaid or invoicing is off.
   */
  async execute(actor: AdminUser, number: number): Promise<Invoice> {
    if (!can(actor.role, 'orders.manage')) throw new DomainError('FORBIDDEN', 'You cannot change orders');
    if (!Number.isSafeInteger(number) || number < 1) throw new DomainError('NOT_FOUND', 'Order not found');
    const order = await this.deps.orders.findByNumber(number);
    if (!order) throw new DomainError('NOT_FOUND', 'Order not found');
    return this.deps.issueInvoice.execute(order.id);
  }
}
