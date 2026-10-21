// Stripe webhook. The signature is checked on the raw body before anything is parsed. A verified event goes to
// ConfirmPayment, which ignores repeats. Failures answer with an error status, so Stripe retries the event.
import type { APIRoute } from 'astro';
import { errorResponse } from '@/http/errors';

export const POST: APIRoute = async ({ request, locals }) => {
  const app = locals.app;
  const raw = await request.text();
  const nowSeconds = Math.floor(app.platform.clock.now().getTime() / 1000);
  try {
    const signed = await app.providers.stripe.verifyWebhook(
      raw,
      request.headers.get('stripe-signature'),
      nowSeconds,
    );
    if (!signed) return Response.json({ ok: false, error: { code: 'INVALID_SIGNATURE' } }, { status: 400 });
    const event = JSON.parse(raw) as Parameters<typeof app.providers.stripe.parseEvent>[0];
    const confirmation = app.providers.stripe.parseEvent(event);
    if (confirmation) await app.confirmPayment.execute(confirmation);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, locals.requestId);
  }
};
