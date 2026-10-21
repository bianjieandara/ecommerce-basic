// Colour values from admin settings. Only 6-digit hex is accepted, so user input can never break out of a CSS value.

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Returns a safe lowercase hex colour, or the fallback when the value is not 6-digit hex.
 * @param value Candidate colour, for example "#D62828".
 * @param fallback Colour used for invalid input.
 * @returns Lowercase "#rrggbb".
 */
export function sanitizeHex(value: string | null | undefined, fallback: string): string {
  return value && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}
