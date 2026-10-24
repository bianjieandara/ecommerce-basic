// Manual stock changes from the inventory screens: the drawer, the bulk bar and the inline buttons all post here.
import { adjustStockInput } from '@/application/inventory/schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: adjustStockInput,
  invalidatesCache: true,
  handler: ({ input, context }) =>
    context.locals.app.inventory.adjustStock.execute(requireAdmin(context.locals.admin), input),
});
