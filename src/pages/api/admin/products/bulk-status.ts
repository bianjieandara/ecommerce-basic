// Status change of several products at once, from the bulk bar of the product list. It never rewrites stock.
import { productBulkStatusInput } from '@/application/catalog/schemas';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: productBulkStatusInput,
  invalidatesCache: true,
  handler: async ({ input, context }) => {
    const changed = await context.locals.app.catalogAdmin.changeProductStatuses.execute(
      input.ids,
      input.status,
    );
    return { ids: changed, status: input.status };
  },
});
