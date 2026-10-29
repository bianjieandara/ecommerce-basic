// The proof of payment of one order: the buyer uploads it with POST and reads it back with GET. Both ask for the order's
// access key, the same one the order link carries, so an order number on its own gives nothing. The admin screens use the
// GET with the key they already hold for the customer's links.
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { MAX_RECEIPT_BYTES, receiptTypeOf } from '@/domain/ordering/payment-receipt';
import { DomainError } from '@/domain/shared/errors';
import { defineEndpoint } from '@/http/define-endpoint';
import { errorResponse } from '@/http/errors';

/** The key travels in the form and in the query string; both are the value from the order link. */
const accessKey = z.string().min(1).max(200);

/**
 * The order number from the route, or null when the path does not name one.
 * @param text Route parameter as written.
 * @returns A positive whole number, or null.
 */
function orderNumber(text: string | undefined): number | null {
  const number = Number(text);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/** Stores the buyer's receipt. The use case checks the order is still waiting for a payment made by hand. */
export const POST = defineEndpoint({
  method: 'POST',
  body: 'form',
  // Its own counter: a store's other endpoints should not be slowed by someone retrying an upload.
  rateLimit: { bucket: 'forms', scope: 'payment-receipt' },
  input: z.object({
    key: accessKey,
    file: z.instanceof(File).refine((file) => file.size > 0 && file.size <= MAX_RECEIPT_BYTES),
  }),
  handler: async ({ input, context }) => {
    const number = orderNumber(context.params.number);
    if (number === null) throw new DomainError('NOT_FOUND', 'Order not found');
    return context.locals.app.submitPaymentReceipt.execute({
      number,
      accessKey: input.key,
      contentType: input.file.type,
      bytes: await input.file.arrayBuffer(),
    });
  },
});

/** Serves the stored receipt to whoever holds the order's key: the buyer, and the store from its admin screens. */
export const GET: APIRoute = async ({ params, url, locals }) => {
  const number = orderNumber(params.number);
  const key = url.searchParams.get('key') ?? '';
  try {
    const view = number === null ? null : await locals.app.orderStatus.execute(number, key);
    const stored = view?.order.paymentReceiptKey ?? null;
    const type = stored === null ? null : receiptTypeOf(stored);
    const file = stored === null ? null : await locals.app.media.get(stored);
    if (view === null || stored === null || type === null || file === null) {
      return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    }
    return new Response(file.body, {
      headers: {
        // The type comes from the stored key, never from the uploaded file, and nosniff keeps the browser from reading the
        // bytes as anything else. A receipt is personal, so it is never cached by a proxy.
        'content-type': type,
        'x-content-type-options': 'nosniff',
        'content-disposition': `inline; filename="${view.order.number}-${stored.slice(stored.lastIndexOf('/') + 1)}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error, locals.requestId);
  }
};
