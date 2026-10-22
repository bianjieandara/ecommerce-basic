// Sets the display order of categories from the list the admin arranged.
import { reorderInput } from '@/application/catalog/schemas';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: reorderInput,
  invalidatesCache: true,
  handler: async ({ input, context }) => {
    await context.locals.app.catalogAdmin.manageCategories.reorder(input.ids);
    return { reordered: true };
  },
});
