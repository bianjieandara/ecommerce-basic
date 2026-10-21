// WhatsApp links (wa.me). The one place that builds them, so every button and gateway uses the same rules.

/**
 * Builds a wa.me link with a prefilled message.
 * @param number Phone number. Non-digit characters are removed.
 * @param message Message text, URL-encoded here.
 * @returns The link, or "" when the number has no digits.
 */
export function whatsappLink(number: string, message: string): string {
  const digits = number.replace(/\D/g, '');
  if (digits === '') return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
