// Owner-only: voids an issued invoice. The use case checks the role and that the order was cancelled or refunded.
import { voidInvoiceInput } from '@/application/invoicing/schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: voidInvoiceInput,
  handler: async ({ input, context }) => {
    const admin = requireAdmin(context.locals.admin);
    await context.locals.app.voidInvoice.execute(admin, input.invoiceId, input.reason);
    return { invoiceId: input.invoiceId, status: 'void' };
  },
});
