// WhatsApp webhook. Meta checks the subscription with GET (answered with the challenge) and posts delivery statuses with POST,
// signed with the app secret. The checks and the updates live in the use case; this route only maps results to HTTP.
// Public by design: readWebhookBody rate limits the caller and caps the body before the signature is checked.
import type { APIRoute } from 'astro';
import { DomainError } from '@/domain/shared/errors';
import { errorResponse } from '@/http/errors';
import { logEvent } from '@/http/log';
import { readWebhookBody } from '@/http/webhook-body';

export const GET: APIRoute = ({ url, locals }) => {
  try {
    const challenge = locals.app.whatsapp.webhook.verifySubscription({
      mode: url.searchParams.get('hub.mode'),
      token: url.searchParams.get('hub.verify_token'),
      challenge: url.searchParams.get('hub.challenge'),
    });
    // Meta compares the answer with the challenge it sent, so it goes back as plain text and nothing else.
    return new Response(challenge, {
      status: 200,
      headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error, locals.requestId);
  }
};

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  try {
    // The signature covers the exact bytes, so the body is read as text and parsed only after the check.
    const raw = await readWebhookBody(context, 'whatsapp');
    const { applied } = await locals.app.whatsapp.webhook.receive(
      raw,
      request.headers.get('x-hub-signature-256'),
    );
    return Response.json({ ok: true, data: { applied } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') {
      logEvent('webhook.rejected', {
        requestId: locals.requestId,
        provider: 'whatsapp',
        reason: 'invalid_signature',
      });
    }
    return errorResponse(error, locals.requestId);
  }
};
