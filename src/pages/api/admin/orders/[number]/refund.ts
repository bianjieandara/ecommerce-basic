// Owner only: sends the whole payment of a paid order back to the customer through its provider (dLocal Go or PayPal).
import { DomainError } from '@/domain/shared/errors';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  invalidatesCache: true,
  handler: ({ context }) => {
    const number = Number(context.params.number);
    if (!Number.isSafeInteger(number) || number < 1) throw new DomainError('NOT_FOUND', 'Order not found');
    return context.locals.app.refundOrder.execute(requireAdmin(context.locals.admin), number);
  },
});
