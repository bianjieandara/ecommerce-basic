// PayPal webhook. PayPal verifies the signature through its own API, so the event is checked before it is applied.
// A verified event goes to ConfirmPayment, which ignores repeats. Failures answer with an error status for a retry.
// Public by design: readWebhookBody rate limits the caller and caps the body before PayPal's API is called.
import type { APIRoute } from 'astro';
import { errorResponse } from '@/http/errors';
import { logEvent } from '@/http/log';
import { readWebhookBody } from '@/http/webhook-body';

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  const app = locals.app;
  try {
    const raw = await readWebhookBody(context, 'paypal');
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
