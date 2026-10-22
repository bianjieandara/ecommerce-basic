// PayPal webhook. PayPal verifies the signature through its own API, so the event is checked before it is applied.
// A verified event goes to ConfirmPayment, which ignores repeats. Failures answer with an error status for a retry.
import type { APIRoute } from 'astro';
import { errorResponse } from '@/http/errors';
import { logEvent } from '@/http/log';

export const POST: APIRoute = async ({ request, locals }) => {
  const app = locals.app;
  const raw = await request.text();
  try {
    const signed = await app.providers.paypal.verifyWebhook(request.headers, raw);
    if (!signed) {
      logEvent('webhook.rejected', {
        requestId: locals.requestId,
        provider: 'paypal',
        reason: 'invalid_signature',
      });
      return Response.json({ ok: false, error: { code: 'INVALID_SIGNATURE' } }, { status: 400 });
    }
    const event = JSON.parse(raw) as Parameters<typeof app.providers.paypal.parseEvent>[0];
    const confirmation = app.providers.paypal.parseEvent(event);
    if (confirmation) await app.confirmPayment.execute(confirmation);
    logEvent('webhook.accepted', {
      requestId: locals.requestId,
      provider: 'paypal',
      applied: Boolean(confirmation),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, locals.requestId);
  }
};
