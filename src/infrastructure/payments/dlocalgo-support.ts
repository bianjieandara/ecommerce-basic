// dLocal Go types and constants: the API hosts, the keys and environment, and the parts of its payment, refund and notification
// objects this adapter reads. Kept apart from the gateway so the gateway stays about behaviour.

/** API base URL per environment. Sandbox and live use different keys, so a key never works against the wrong host. */
export const DLOCALGO_HOSTS = {
  sandbox: 'https://api-sbx.dlocalgo.com',
  live: 'https://api.dlocalgo.com',
} as const;

/** Which dLocal Go environment the store talks to. */
export type DLocalGoEnvironment = keyof typeof DLOCALGO_HOSTS;

/** Settings the adapter reads from its environment. */
export interface DLocalGoConfig {
  /** API key, or null when not configured. */
  apiKey: string | null;
  /** Secret key, or null when not configured. It signs notifications and is never sent to a browser. */
  secretKey: string | null;
  environment: DLocalGoEnvironment;
}

/** Payment status values the API documents. */
export type DLocalGoPaymentStatus = 'PENDING' | 'PAID' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

/** The parts of a payment this adapter reads (create and retrieve answer with the same object). */
export interface DLocalGoPayment {
  id: string;
  /** Decimal amount in the payment currency (550.00), not minor units. */
  amount: number;
  currency: string;
  status: DLocalGoPaymentStatus;
  order_id?: string;
  /** Where the buyer pays. Single use, valid for 24 hours. */
  redirect_url?: string;
}

/** Refund status values the API documents. */
export type DLocalGoRefundStatus = 'PENDING' | 'SUCCESS' | 'REJECTED' | 'CANCELLED';

/** The parts of a refund this adapter reads. */
export interface DLocalGoRefund {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: DLocalGoRefundStatus;
}

/**
 * Body of a status-change notification. The documented body carries only the payment id; a refund notification is documented
 * as carrying "the ID of the payment or refund", so both field names are read. Nothing in it is trusted: the status and the
 * amount always come from asking dLocal Go for the object.
 */
export interface DLocalGoNotification {
  payment_id?: string;
  refund_id?: string;
}

/** Shortest and longest time a checkout stays open, in minutes. */
export const MIN_CHECKOUT_MINUTES = 15;
export const MAX_CHECKOUT_MINUTES = 24 * 60;
