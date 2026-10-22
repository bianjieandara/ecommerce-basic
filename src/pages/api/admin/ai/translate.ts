// Translates one text for an admin editor. Nothing is saved: the editor applies the result and saves the form.
import { translateInput } from '@/application/ai/translate-schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: translateInput,
  rateLimit: 'api',
  handler: ({ input, context }) =>
    context.locals.app.translate.execute(requireAdmin(context.locals.admin), input),
});
