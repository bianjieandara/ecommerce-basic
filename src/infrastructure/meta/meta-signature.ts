// Meta webhook checks: the subscription token of the GET handshake and the X-Hub-Signature-256 of every POST delivery. Both
// compare in constant time, and both refuse when their secret is not set, so a missing setting can never open the endpoint.
import type { WhatsAppWebhookAuth } from '@/application/ports/whatsapp';

/** Prefix Meta puts before the hex digest in X-Hub-Signature-256. */
const SIGNATURE_PREFIX = 'sha256=';

/**
 * Compares two strings without stopping at the first difference, so the time taken does not reveal how much matched.
 * @param a First value.
 * @param b Second value.
 * @returns True when both are equal.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/**
 * HMAC-SHA256 of a message as lowercase hex.
 * @param secret Key.
 * @param message Message to sign.
 */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Webhook checks backed by the verify token and the app secret from the Worker settings. */
export class MetaWebhookAuth implements WhatsAppWebhookAuth {
  /**
   * @param verifyToken WHATSAPP_VERIFY_TOKEN, or null when not set.
   * @param appSecret META_APP_SECRET, or null when not set.
   */
  constructor(
    private readonly verifyToken: string | null,
    private readonly appSecret: string | null,
  ) {}

  verifySubscriptionToken(token: string | null): boolean {
    if (!this.verifyToken || token === null) return false;
    return constantTimeEqual(token, this.verifyToken);
  }

  /**
   * Checks that the delivery was signed with the app secret over its exact bytes.
   * @param rawBody Body as received, before any parsing.
   * @param signatureHeader Value of X-Hub-Signature-256.
   */
  async verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    if (!this.appSecret || !signatureHeader?.startsWith(SIGNATURE_PREFIX)) return false;
    const expected = await hmacSha256Hex(this.appSecret, rawBody);
    return constantTimeEqual(signatureHeader.slice(SIGNATURE_PREFIX.length), expected);
  }
}
