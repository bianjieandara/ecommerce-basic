// Owner or editor: moves an order to a state the store sets by hand. The checks, the timeline and the stock are in the use case.
import { adminOrderStatusInput } from '@/application/ordering/admin-schemas';
import { DomainError } from '@/domain/shared/errors';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: adminOrderStatusInput,
  handler: async ({ input, context }) => {
    const number = Number(context.params.number);
    if (!Number.isInteger(number) || number <= 0) throw new DomainError('NOT_FOUND', 'Order not found');
    const admin = requireAdmin(context.locals.admin);
    return context.locals.app.adminOps.changeOrderStatus.execute(admin, {
      number,
      to: input.to,
      notify: input.notify,
      trackingCode: input.trackingCode || null,
      note: input.note,
    });
  },
});
