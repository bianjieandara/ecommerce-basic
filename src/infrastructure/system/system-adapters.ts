// System adapters: clock, identifiers and SHA-256, all from standard Web APIs (no Node-only modules).
import type { Clock, Hasher, IdGenerator } from '@/application/ports/platform';

/** Real wall-clock time. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Identifiers from the Web Crypto API. */
export class CryptoIdGenerator implements IdGenerator {
  newId(): string {
    return crypto.randomUUID();
  }

  /**
   * @param bytes Number of random bytes (default 32, which gives a 43-character secret).
   * @returns URL-safe base64 secret.
   */
  newSecret(bytes = 32): string {
    const random = crypto.getRandomValues(new Uint8Array(bytes));
    return toBase64Url(random);
  }
}

/** SHA-256 with Web Crypto. */
export class WebCryptoHasher implements Hasher {
  async sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Encodes bytes as base64url without padding.
 * @param bytes Bytes to encode.
 * @returns base64url text.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
