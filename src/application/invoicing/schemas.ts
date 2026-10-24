// Input schemas of the invoicing endpoints. The endpoints reuse these, so each shape is declared once.
import '@/application/zod-config';
import { z } from 'zod';

/** Voiding needs the invoice id and a reason, which stays on the record for the books. */
export const voidInvoiceInput = z.object({
  invoiceId: z.string().min(1).max(64),
  reason: z.string().trim().min(3).max(200),
});
