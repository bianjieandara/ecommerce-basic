// Plain-text version of an email body. Clients that cannot show HTML display it, and it helps spam filters.

/**
 * Converts an email body to readable text: line breaks for block tags and cells, other tags removed, common entities
 * decoded. `&amp;` is decoded last so that `&amp;lt;` stays `&lt;`.
 * @param html Rendered body HTML.
 * @returns Plain text.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/td>/gi, '  ')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
