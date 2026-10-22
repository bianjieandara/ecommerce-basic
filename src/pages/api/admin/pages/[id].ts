// Saves a page from the page builder: its texts, its publication and its sections.
import { savePageInput } from '@/application/content/page-schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: savePageInput,
  invalidatesCache: true,
  handler: ({ input, context }) =>
    context.locals.app.contentAdmin.savePage.execute(
      requireAdmin(context.locals.admin),
      context.params.id ?? '',
      input,
    ),
});
