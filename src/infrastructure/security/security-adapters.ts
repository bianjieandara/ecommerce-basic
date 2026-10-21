// Security adapters: password hashing (PBKDF2), Turnstile verification and rate limiting.
import type { PasswordHasher } from '@/application/ports/identity';
import type { BotVerifier, RateLimitBucket, RateLimiter } from '@/application/ports/platform';
import { workersFetch } from '../system/http-fetch';
import { toBase64Url } from '../system/system-adapters';

/** PBKDF2 iterations. 100 000 is the maximum the Workers runtime allows. */
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const HASH_PREFIX = 'pbkdf2_sha256';

/** Decodes base64url (no padding) to bytes. */
function fromBase64Url(text: string): Uint8Array {
  const padded = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** PBKDF2-SHA256 password hashing with WebCrypto. Stored format: pbkdf2_sha256$iterations$salt$hash. */
export class Pbkdf2PasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const derived = await derive(plain, salt, PBKDF2_ITERATIONS);
    return `${HASH_PREFIX}$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
  }

  async verify(plain: string, stored: string): Promise<boolean> {
    const [prefix, iterations, saltText, hashText] = stored.split('$');
    if (prefix !== HASH_PREFIX || !iterations || !saltText || !hashText) return false;
    const expected = fromBase64Url(hashText);
    const derived = await derive(plain, fromBase64Url(saltText), Number(iterations), expected.length);
    return timingSafeEqual(derived, expected);
  }
}

/**
 * Derives a PBKDF2 key.
 * @param plain Password text.
 * @param salt Random salt.
 * @param iterations PBKDF2 iterations.
 * @param length Output length in bytes.
 * @returns Derived bytes.
 */
async function derive(
  plain: string,
  salt: Uint8Array,
  iterations: number,
  length = KEY_BYTES,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(plain), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Compares two byte arrays in constant time (no early exit on the first difference).
 * @param a First value.
 * @param b Second value.
 * @returns True when equal.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Verifies Cloudflare Turnstile tokens. Missing secret or network errors mean "not verified". */
export class TurnstileVerifier implements BotVerifier {
  /**
   * @param secret Turnstile secret key.
   * @param fetcher Fetch implementation (injected for tests).
   */
  constructor(
    private readonly secret: string | null,
    private readonly fetcher: typeof fetch = workersFetch,
  ) {}

  async verify(token: string | null, ip: string | null): Promise<boolean> {
    if (!this.secret || !token) return false;
    const body = new FormData();
    body.set('secret', this.secret);
    body.set('response', token);
    if (ip) body.set('remoteip', ip);
    try {
      const response = await this.fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body,
      });
      const result = (await response.json()) as { success?: boolean };
      return result.success === true;
    } catch {
      return false;
    }
  }
}

/** Maps rate-limit buckets to their Workers bindings. */
export class CloudflareRateLimiter implements RateLimiter {
  /** @param bindings The three rate limit bindings from wrangler.base.jsonc. */
  constructor(private readonly bindings: Record<RateLimitBucket, RateLimit>) {}

  async allow(bucket: RateLimitBucket, key: string): Promise<boolean> {
    const result = await this.bindings[bucket].limit({ key: `${bucket}:${key}` });
    return result.success;
  }
}
