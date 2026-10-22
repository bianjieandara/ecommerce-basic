// Placeholders the email editor inserts. A variable is {{path}}; a block is {{block:name}}, the syntax the template engine reads.
// Typing these by hand is error-prone, so the editor writes them from the lists the email allows.

/** Kind of placeholder the insert panel offers. */
export type TokenKind = 'variable' | 'block';

/**
 * The text of one placeholder.
 * @param kind Variable or block.
 * @param name Variable path or block name.
 * @returns The placeholder as it is written in a body.
 */
export function tokenFor(kind: TokenKind, name: string): string {
  return kind === 'variable' ? `{{${name}}}` : `{{block:${name}}}`;
}

/**
 * Replaces the selected text with a placeholder, the way typing at the cursor would.
 * @param text Body as it is now.
 * @param start Start of the selection (the cursor when nothing is selected).
 * @param end End of the selection.
 * @param token Placeholder to insert.
 * @returns The new text, and the caret position after the placeholder.
 */
export function insertAt(
  text: string,
  start: number,
  end: number,
  token: string,
): { text: string; caret: number } {
  return { text: text.slice(0, start) + token + text.slice(end), caret: start + token.length };
}
