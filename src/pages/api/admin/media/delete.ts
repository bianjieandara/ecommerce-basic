// Removes an image from the library. Refused while a product or a category still uses it.
import { idInput } from '@/application/catalog/schemas';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: idInput,
  invalidatesCache: true,
  handler: async ({ input, context }) => {
    await context.locals.app.mediaLibrary.remove(input.id);
    return { removed: true };
  },
});
