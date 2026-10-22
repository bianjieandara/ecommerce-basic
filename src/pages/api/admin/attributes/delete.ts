// Deletes an attribute that no variant uses.
import { idInput } from '@/application/catalog/schemas';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: idInput,
  invalidatesCache: true,
  handler: async ({ input, context }) => {
    await context.locals.app.catalogAdmin.manageAttributes.remove(input.id);
    return { removed: true };
  },
});
