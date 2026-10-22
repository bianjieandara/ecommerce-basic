// Saves one WhatsApp message: its Meta name, body per language, parameter mapping, button and whether it is sent. The use case
// checks owner permission, the body against the parameters, and the approved-content lock.
import { saveWhatsAppInput, whatsappKeyFrom } from '@/application/notifications/whatsapp/whatsapp-schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: saveWhatsAppInput,
  handler: ({ input, context }) =>
    context.locals.app.whatsapp.templates.save(
      requireAdmin(context.locals.admin),
      whatsappKeyFrom(context.params.key ?? ''),
      input,
    ),
});
