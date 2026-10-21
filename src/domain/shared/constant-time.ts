// Comparison that reads every character, so response timing does not reveal how much of a secret matched.

/**
 * Compares two strings without stopping at the first difference.
 * @param a First value.
 * @param b Second value.
 * @returns True when the strings are identical.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}
