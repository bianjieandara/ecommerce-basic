// Submits one WhatsApp message to Meta, one language at a time, under its Meta name. Returns what Meta now knows per language.
import { whatsappKeyFrom } from '@/application/notifications/whatsapp/whatsapp-schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  handler: ({ context }) =>
    context.locals.app.whatsapp.metaSync.submit(
      requireAdmin(context.locals.admin),
      whatsappKeyFrom(context.params.key ?? ''),
    ),
});
