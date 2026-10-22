// Creates a custom page. The page starts unpublished and empty; the builder fills it.
import { createPageInput } from '@/application/content/page-schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

/** POST: creates a custom page (the page builder fills it). */
export const POST = defineEndpoint({
  method: 'POST',
  input: createPageInput,
  invalidatesCache: true,
  handler: ({ input, context }) =>
    context.locals.app.contentAdmin.createPage.execute(requireAdmin(context.locals.admin), input),
});
