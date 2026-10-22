// dLocal Go notification. The signature is checked on the raw body before anything is parsed. A verified notification names a
// payment (or refund); the gateway asks dLocal Go for it and ConfirmPayment applies the answer, ignoring repeats. Any failure
// answers with an error status, so dLocal Go retries (every 10 minutes for up to 30 days). Anything else answers 200.
import type { APIRoute } from 'astro';
import { errorResponse } from '@/http/errors';

export const POST: APIRoute = async ({ request, locals }) => {
  const app = locals.app;
  const raw = await request.text();
  try {
    const signed = await app.providers.dlocalgo.verifyWebhook(raw, request.headers.get('authorization'));
    if (!signed) return Response.json({ ok: false, error: { code: 'INVALID_SIGNATURE' } }, { status: 400 });
    const notification = JSON.parse(raw) as Parameters<typeof app.providers.dlocalgo.confirmationFor>[0];
    const confirmation = await app.providers.dlocalgo.confirmationFor(notification);
    if (confirmation) await app.confirmPayment.execute(confirmation);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, locals.requestId);
  }
};
