// Inventory inputs: manual adjustments, the back-in-stock subscription, the scanner lookup and the CSV import. The admin
// screens and the endpoints validate with these same schemas.
import '@/application/zod-config';
import { z } from 'zod';
import { MANUAL_STOCK_REASONS, MAX_ADJUST_ITEMS } from '@/domain/inventory/stock';
import { SUPPORTED_LOCALES } from '@/domain/shared/locale';
import { MAX_IMPORT_BYTES } from './stock-import';

/** One variant of a manual adjustment: add or remove units, or set the counted value. */
const adjustItem = z.object({
  variantId: z.string().min(1).max(64),
  mode: z.enum(['delta', 'set']),
  value: z.number().int().min(-1_000_000).max(1_000_000),
  /**
   * The stock the admin was looking at. A "set" is applied as the difference from it, so a sale made while the form was open
   * is kept, like the product editor does. Without it the stock on record at submit time is used.
   */
  expected: z.number().int().min(0).max(1_000_000).optional(),
});

/** Manual change for up to 50 variants. The drawer, the bulk bar and the inline buttons all send this shape. */
export const adjustStockInput = z.object({
  items: z.array(adjustItem).min(1).max(MAX_ADJUST_ITEMS),
  reason: z.enum(MANUAL_STOCK_REASONS),
  note: z.string().trim().max(200).nullable().default(null),
});

/** "Tell me when it is back" from the storefront. */
export const subscribeInput = z.object({
  variantId: z.string().min(1).max(64),
  email: z.email().max(254),
  phone: z.string().trim().max(30).nullable().default(null),
  /** Language of the storefront page the request came from. Missing means the store's default language. */
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  whatsappOptIn: z.boolean().default(false),
  /** The shopper agreed to the privacy policy and the terms. The form requires it; the server must too. */
  acceptedLegal: z.literal(true),
  turnstileToken: z.string().max(2048).nullable().default(null),
});

/** A SKU or barcode typed or scanned on the inventory screen. */
export const lookupInput = z.object({ code: z.string().trim().min(1).max(64) });

/** CSV import form: the file, and whether this request only previews it ('1') or applies it ('0'). */
export const importStockInput = z.object({
  file: z.instanceof(File).refine((file) => file.size <= MAX_IMPORT_BYTES, 'The file is larger than 2 MB'),
  dryRun: z.enum(['0', '1']).default('0'),
});

/** Parsed manual adjustment. */
export type AdjustStockInput = z.infer<typeof adjustStockInput>;

/** Parsed subscription request. */
export type SubscribeInput = z.infer<typeof subscribeInput>;

/** Parsed import form. */
export type ImportStockInput = z.infer<typeof importStockInput>;
