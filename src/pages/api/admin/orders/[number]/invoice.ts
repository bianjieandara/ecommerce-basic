// Owner or editor: issues the invoice of a paid order that has none. An order that already has one gets that invoice back.
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: async ({ context }) => {
    const admin = requireAdmin(context.locals.admin);
    const invoice = await context.locals.app.adminOps.issueOrderInvoice.execute(
      admin,
      Number(context.params.number),
    );
    return { invoiceId: invoice.id };
  },
});
