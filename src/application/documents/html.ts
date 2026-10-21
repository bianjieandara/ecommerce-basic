// HTML building helpers shared by emails, invoices and feeds. Every value that comes from a user or from the database
// goes through escapeHtml before it is placed in markup.

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes text for use in HTML text nodes and quoted attributes.
 * @param value Untrusted text.
 * @returns Escaped text.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/**
 * Builds an attribute list from name/value pairs. Values are escaped; empty values are skipped.
 * @param attributes Attribute map.
 * @returns Attribute text with a leading space, or "".
 */
export function attrs(attributes: Record<string, string | number | undefined>): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([name, value]) => ` ${name}="${escapeHtml(String(value))}"`)
    .join('');
}
