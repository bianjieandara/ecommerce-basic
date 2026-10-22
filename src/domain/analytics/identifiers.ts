// Normalization of customer identifiers before they are hashed for Meta. Meta matches a hash only when the input was
// normalized the way Meta documents: a trimmed lowercase email, and a phone of digits only with its country code.

/**
 * Normalizes an email for hashing.
 * @param value Email as typed or stored.
 * @returns The trimmed lowercase address, or null when nothing is left.
 */
export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email === '' ? null : email;
}

/**
 * Normalizes a phone number for hashing: only the digits stay, the "+", spaces and separators go.
 * @param value Phone as typed or stored.
 * @returns The digits, or null when the value has no digits.
 */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return digits === '' ? null : digits;
}
