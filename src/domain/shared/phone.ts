// Phone normalization for WhatsApp and contact fields. Output is digits only (E.164 without "+"),
// which is the format WhatsApp Cloud API and wa.me links expect.

/** Shortest and longest plausible international numbers (digits only). */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * Converts a typed phone number to digits with the country code.
 * Rules: "+" or "00" means the number already has a country code; otherwise the default country code is added
 * unless the digits already start with it and are longer than a national number (10 digits).
 * @param raw Text typed by the customer or admin.
 * @param defaultCountryCode Country calling code without "+", for example "57".
 * @returns Digits with country code, or null when the length is not plausible.
 */
export function normalizePhone(raw: string, defaultCountryCode: string): string | null {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');

  if (hasPlus) {
    // Already international: keep as typed.
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (!(digits.startsWith(defaultCountryCode) && digits.length > 10)) {
    digits = defaultCountryCode + digits.replace(/^0+/, '');
  }

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return digits;
}

/**
 * The target of a `tel:` link for a phone as the owner typed it. The tel scheme takes digits and a leading "+", not the spaces,
 * dashes or brackets people write for readability, and some dialers and screen readers fail on them.
 * @param raw Phone as typed, for example "+57 (300) 000-0000".
 * @returns The link, or "" when there are no digits.
 */
export function telLink(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return '';
  return `tel:${raw.trim().startsWith('+') ? '+' : ''}${digits}`;
}
