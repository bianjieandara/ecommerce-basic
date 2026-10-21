// Order lifecycle. Only the transitions listed here are allowed; anything else is an INVALID_STATE error.
import { DomainError } from '../shared/errors';

/** Every state an order can be in. Matches the CHECK constraint on orders.status. */
export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;

/** One order state. */
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['processing', 'refunded', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
  refunded: [],
};

/** States in which money has been received. Revenue and invoices count these. */
const PAID_OR_LATER: readonly OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

/**
 * Checks whether an order may move from one state to another.
 * @param from Current state.
 * @param to Requested state.
 * @returns True when the transition is allowed.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Throws when a transition is not allowed. Use it before every status change.
 * @param from Current state.
 * @param to Requested state.
 * @throws DomainError INVALID_STATE when the transition is not allowed.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError('INVALID_STATE', `Cannot change order status from ${from} to ${to}`);
  }
}

/**
 * True when the order has been paid (or later), so revenue and invoices apply.
 * @param status Order state.
 * @returns Whether money was received.
 */
export function isPaidOrLater(status: OrderStatus): boolean {
  return PAID_OR_LATER.includes(status);
}
