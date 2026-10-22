// Category save endpoint: creates or updates one category, its parent, image and text per language.
import { categoryInput } from '@/application/catalog/schemas';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: categoryInput,
  invalidatesCache: true,
  handler: ({ input, context }) => context.locals.app.catalogAdmin.manageCategories.upsert(input),
});
