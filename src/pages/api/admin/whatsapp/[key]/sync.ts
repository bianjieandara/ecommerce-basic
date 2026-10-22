// Reads the review status of one WhatsApp message from Meta and stores it per language.
import { whatsappKeyFrom } from '@/application/notifications/whatsapp/whatsapp-schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: ({ context }) =>
    context.locals.app.whatsapp.metaSync.sync(
      requireAdmin(context.locals.admin),
      whatsappKeyFrom(context.params.key ?? ''),
    ),
});
