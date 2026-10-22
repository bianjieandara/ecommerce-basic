// Shortens text for a table cell, so one long error or message cannot stretch a row. The full text stays in the data.

/**
 * Shortens text to `max` characters, ellipsis included, and shows a dash for no text.
 * @param text Text, or null when there is none.
 * @param max Longest result, ellipsis included.
 * @returns The text, cut when it is too long; a dash when there is none.
 */
export function cutText(text: string | null, max: number): string {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
