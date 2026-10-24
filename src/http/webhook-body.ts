// Entry guard of the payment and messaging webhooks. They cannot use defineEndpoint (the signature covers the raw bytes), but
// they are public, and verifying a signature can cost an outbound call to the provider, so a flood is turned away first.
import type { APIContext } from 'astro';
import { enforceRateLimit, readCapped } from './define-endpoint';

/** Largest webhook body read. Provider events are a few kilobytes; this leaves room and still stops a large upload. */
const MAX_WEBHOOK_BYTES = 128 * 1024;

/**
 * Rate limits the caller and reads the raw body up to a size limit.
 * @param context Astro context of the webhook request.
 * @param provider Name of the sender, which keeps its counter apart from the other webhooks and the API.
 * @returns The body as text, exactly as received, for the signature check.
 * @throws DomainError RATE_LIMITED, or VALIDATION_FAILED when the body is too large.
 */
export async function readWebhookBody(context: APIContext, provider: string): Promise<string> {
  await enforceRateLimit(context, { bucket: 'api', scope: `webhook-${provider}` });
  return new TextDecoder().decode(await readCapped(context.request, MAX_WEBHOOK_BYTES));
}
