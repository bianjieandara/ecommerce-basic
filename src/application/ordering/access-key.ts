// Order access keys. The customer receives the key in the order link; only its SHA-256 is stored, so a database leak
// does not reveal working links.
import { constantTimeEqual } from '@/domain/shared/constant-time';
import type { Hasher, IdGenerator } from '../ports/platform';

/**
 * Creates an order access key: 32 random bytes in base64url.
 * @param ids Identifier generator.
 * @returns The key to show the customer.
 */
export function newAccessKey(ids: IdGenerator): string {
  return ids.newSecret(32);
}

/**
 * Checks a key against the hash stored with the order.
 * @param hasher SHA-256 hasher.
 * @param key Key from the link.
 * @param storedHash Hash stored with the order.
 * @returns True when the key belongs to the order.
 */
export async function accessKeyMatches(hasher: Hasher, key: string, storedHash: string): Promise<boolean> {
  return constantTimeEqual(await hasher.sha256Hex(key), storedHash);
}
