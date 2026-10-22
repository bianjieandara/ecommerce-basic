// Input of one shipping method as the admin saves it. Money is integer minor units; the kind-dependent price rule is applied by
// ManageShipping, so a pickup can never be stored with a charge.
import { z } from 'zod';
import { SHIPPING_KINDS } from '@/domain/ordering/shipping';

/** Largest amount a shipping method may charge, in minor units (1,000,000.00 in a two-digit currency). */
const MAX_MINOR = 100_000_000;

/** Name in both languages. At least one language must be filled in, checked below. */
const nameText = z.object({ es: z.string().trim().max(80), en: z.string().trim().max(80) });

/** Description in both languages. Either may be empty. */
const descriptionText = z.object({ es: z.string().trim().max(300), en: z.string().trim().max(300) });

/** One shipping method. Without an id the method is new; with one it replaces that method. */
export const shippingMethodInput = z
  .object({
    id: z.string().min(1).max(64).optional(),
    kind: z.enum(SHIPPING_KINDS),
    name: nameText,
    description: descriptionText,
    priceMinor: z.number().int().min(0).max(MAX_MINOR),
    freeOverMinor: z.number().int().min(0).max(MAX_MINOR).nullable(),
    isActive: z.boolean(),
    position: z.number().int().min(0).max(999),
  })
  .refine((value) => value.name.es !== '' || value.name.en !== '', {
    message: 'Enter the name in at least one language',
    path: ['name'],
  });

/** A shipping method as the admin saves it. */
export type ShippingMethodInput = z.infer<typeof shippingMethodInput>;
