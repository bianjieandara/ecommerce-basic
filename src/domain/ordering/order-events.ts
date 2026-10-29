// Order timeline events. A status change is stored as status_<status>; the other events have a type of their own. Writers and
// screens both name them here, so a label never drifts from the event it describes.
import { ORDER_STATUSES, type OrderStatus } from './order-status';

/** Timeline events that are not status changes. Each one has a label in the dictionary (order.events). */
export const ORDER_EVENT_TYPES = [
  'placed',
  'payment_confirmed',
  'payment_failed',
  'payment_expired',
  'payment_start_failed',
  'expired',
  'cancelled',
  'refunded',
  'refund_requested',
  'payment_receipt_uploaded',
  'invoice_voided',
] as const;

/** A timeline event type that has a label of its own. */
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

/**
 * The type a status change is stored under, so the timeline can tell it from the other events.
 * @param status State the order moved to.
 * @returns The stored type, such as `status_shipped`.
 */
export function statusEventType(status: OrderStatus): string {
  return `status_${status}`;
}

/**
 * The state a timeline event moved the order to, when it is a status change.
 * @param type Event type as stored.
 * @returns The state, or null when the event is not a status change.
 */
export function statusOfEvent(type: string): OrderStatus | null {
  return ORDER_STATUSES.find((status) => statusEventType(status) === type) ?? null;
}

/**
 * Whether an event type has a label of its own.
 * @param type Event type as stored.
 * @returns True for the types in ORDER_EVENT_TYPES.
 */
export function isOrderEventType(type: string): type is OrderEventType {
  return (ORDER_EVENT_TYPES as readonly string[]).includes(type);
}
