// Order access keys. The customer receives the key in the order link; only its SHA-256 is stored, so a database leak
// does not reveal the checkout key. Messages sent after checkout cannot carry that key (it is not stored), so they carry a
// second key that the server can always rebuild from the stored hash.
import { constantTimeEqual } from '@/domain/shared/constant-time';
import type { Hasher, IdGenerator } from '../ports/platform';

/** Prefix that keeps the email key from ever equalling the hash it is made from. */
const EMAIL_KEY_PREFIX = 'order-email-link:';

/**
 * Creates an order access key: 32 random bytes in base64url.
 * @param ids Identifier generator.
 * @returns The key to show the customer.
 */
export function newAccessKey(ids: IdGenerator): string {
  return ids.newSecret(32);
}

/**
 * The key that emails after checkout put in the order link. It is the SHA-256 of a fixed prefix and the order's stored key
 * hash, so the server can rebuild it for any order, while nobody without the stored hash can guess it. It opens the same
 * pages as the checkout key and, like it, does not expire.
 * @param hasher SHA-256 hasher.
 * @param storedHash Hash stored with the order.
 * @returns The email key (64 hexadecimal characters).
 */
export function emailLinkKey(hasher: Hasher, storedHash: string): Promise<string> {
  return hasher.sha256Hex(`${EMAIL_KEY_PREFIX}${storedHash}`);
}

/**
 * Checks a key against the order: it is either the checkout key (its hash is the stored one) or the email key. Both
 * comparisons always run, so the answer takes the same time whichever key was sent.
 * @param hasher SHA-256 hasher.
 * @param key Key from the link.
 * @param storedHash Hash stored with the order.
 * @returns True when the key belongs to the order.
 */
export async function accessKeyMatches(hasher: Hasher, key: string, storedHash: string): Promise<boolean> {
  const [checkoutMatch, emailMatch] = await Promise.all([
    hasher.sha256Hex(key).then((hash) => constantTimeEqual(hash, storedHash)),
    emailLinkKey(hasher, storedHash).then((expected) => constantTimeEqual(key, expected)),
  ]);
  return checkoutMatch || emailMatch;
}
