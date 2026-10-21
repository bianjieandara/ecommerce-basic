// Safe Markdown rendering shared by content pages, product descriptions and email templates. micromark keeps raw HTML
// escaped by default, so stored text cannot inject markup.
import { micromark } from 'micromark';

/**
 * Renders Markdown to HTML. Output is safe to insert with set:html because raw HTML stays escaped.
 * @param source Markdown text from settings, pages, product descriptions or email templates.
 * @returns HTML text.
 */
export function renderMarkdown(source: string): string {
  return micromark(source);
}
