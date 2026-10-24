// Saves the alternative text of an image, in both languages. Empty texts are dropped.
import { mediaAltInput } from '@/application/catalog/schemas';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: mediaAltInput,
  invalidatesCache: true,
  handler: async ({ input, context }) => ({
    alt: await context.locals.app.mediaLibrary.updateAlt(input.id, input.alt),
  }),
});
