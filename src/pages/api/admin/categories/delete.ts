// Deletes a category that has no subcategories and no products.
import { idInput } from '@/application/catalog/schemas';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: idInput,
  invalidatesCache: true,
  handler: async ({ input, context }) => {
    await context.locals.app.catalogAdmin.manageCategories.remove(input.id);
    return { removed: true };
  },
});
