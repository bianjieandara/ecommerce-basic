// Copies a product as a draft, with its variants and stock. The copy gets new SKUs only when the admin sets them.
import { idInput } from '@/application/catalog/schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: idInput,
  invalidatesCache: true,
  handler: ({ input, context }) =>
    context.locals.app.catalogAdmin.duplicateProduct.execute(input.id, requireAdmin(context.locals.admin).id),
});
