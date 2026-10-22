// Checkout input. The browser sends what the customer typed and the cart lines; the server re-checks everything.
import { z } from 'zod';
import { MAX_LINE_QUANTITY } from '@/domain/ordering/cart-line';
import { SUPPORTED_LOCALES } from '@/domain/shared/locale';
import { PAYMENT_METHODS } from '../ports/payments';

/**
 * Largest number of lines in one order. Each line writes up to three rows, so this keeps an order to about a hundred
 * statements in one batch. D1 documents no batch ceiling, so the cap is a conservative guess: measure before raising it.
 */
export const MAX_ORDER_LINES = 30;

/** Largest number of attribution fields (UTM values and the like) stored with an order. */
const MAX_ATTRIBUTION_FIELDS = 20;

/** Shipping address for delivery. Pickup orders send null. */
const shippingAddressInput = z.object({
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).default(''),
  city: z.string().trim().min(2).max(120),
  region: z.string().trim().max(120).default(''),
  postalCode: z.string().trim().max(20).default(''),
  country: z.string().trim().length(2),
});

/** Checkout request body. */
export const placeOrderInput = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
        unitPriceMinor: z.number().int().min(0).optional(),
      }),
    )
    .min(1)
    .max(MAX_ORDER_LINES),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.email().max(254),
    phone: z.string().trim().min(6).max(30),
  }),
  whatsappOptIn: z.boolean().default(false),
  shippingMethodId: z.string().min(1).max(64),
  address: shippingAddressInput.nullable().default(null),
  paymentMethod: z.enum(PAYMENT_METHODS),
  note: z.string().trim().max(500).default(''),
  billing: z
    .object({
      legalName: z.string().trim().max(200).default(''),
      taxId: z.string().trim().max(40).default(''),
    })
    .nullable()
    .default(null),
  attribution: z
    .record(z.string().max(40), z.string().max(200))
    .refine((value) => Object.keys(value).length <= MAX_ATTRIBUTION_FIELDS, 'Too many attribution fields')
    .default({}),
  turnstileToken: z.string().max(2048).nullable().default(null),
});

/** Parsed checkout request. */
export type PlaceOrderInput = z.infer<typeof placeOrderInput>;
