// Product save endpoint. It validates with the same schema as the editor, then saves the whole product in one batch.
import { productInput } from '@/application/catalog/schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: productInput,
  invalidatesCache: true,
  handler: ({ input, context }) =>
    context.locals.app.catalogAdmin.upsertProduct.execute(requireAdmin(context.locals.admin), input),
});
