// Inputs of the admin order actions. The order number comes from the path; these fields come from the screen.
import { z } from 'zod';
import { MANUAL_ORDER_TARGETS } from '@/domain/ordering/order-status';

/** A move the store owner makes by hand: the new state, whether the customer hears of it, and what goes with it. */
export const adminOrderStatusInput = z.object({
  to: z.enum(MANUAL_ORDER_TARGETS),
  notify: z.boolean().default(true),
  trackingCode: z.string().trim().max(64).default(''),
  note: z.string().trim().max(200).default(''),
});

/** Parsed input of an admin order status change. */
export type AdminOrderStatusInput = z.infer<typeof adminOrderStatusInput>;
