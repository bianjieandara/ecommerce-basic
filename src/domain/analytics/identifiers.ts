// Normalization of customer identifiers before they are hashed for Meta. Meta matches a hash only when the input was
// normalized the way Meta documents: a trimmed lowercase email, and a phone of digits with its country code (the phone rule
// is the shared one in domain/shared/phone.ts, so WhatsApp and Meta see the same number).

/**
 * Normalizes an email for hashing.
 * @param value Email as typed or stored.
 * @returns The trimmed lowercase address, or null when nothing is left.
 */
export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email === '' ? null : email;
}
