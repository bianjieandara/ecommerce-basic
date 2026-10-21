// Markdown to HTML for content blocks. micromark keeps raw HTML escaped by default, so stored content cannot inject markup.
import { micromark } from 'micromark';

/**
 * Renders markdown to HTML. Output is safe to insert with set:html because raw HTML stays escaped.
 * @param source Markdown text from settings, pages or product descriptions.
 * @returns HTML text.
 */
export function renderMarkdown(source: string): string {
  return micromark(source);
}
