// Quick status change from the product list. It never rewrites stock.
import { productStatusInput } from '@/application/catalog/schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: productStatusInput,
  invalidatesCache: true,
  handler: async ({ input, context }) => {
    await context.locals.app.catalogAdmin.changeProductStatus.execute(
      requireAdmin(context.locals.admin),
      input.id,
      input.status,
    );
    return { id: input.id, status: input.status };
  },
});
