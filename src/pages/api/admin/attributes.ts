// Attribute save endpoint: creates or updates an attribute and its values.
import { attributeInput } from '@/application/catalog/schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: attributeInput,
  invalidatesCache: true,
  handler: ({ input, context }) =>
    context.locals.app.catalogAdmin.manageAttributes.upsert(requireAdmin(context.locals.admin), input),
});
