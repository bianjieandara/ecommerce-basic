// Queues a test WhatsApp message with sample values to the signed-in admin's own phone. The outcome shows in the message log.
import { whatsappKeyFrom } from '@/application/notifications/whatsapp/whatsapp-schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: ({ context }) =>
    context.locals.app.whatsapp.templates.sendTest(
      requireAdmin(context.locals.admin),
      whatsappKeyFrom(context.params.key ?? ''),
    ),
});
