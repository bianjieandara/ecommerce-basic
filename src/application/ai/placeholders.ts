// Masks template placeholders such as {{name}} or {{> block}} before machine translation and restores them afterwards,
// so the translator never edits variable names. Pure functions: no I/O, no platform APIs.

/** A double-brace placeholder, including partials ({{> block}}). Braces inside it are not allowed, so nesting is not matched. */
const PLACEHOLDER = /\{\{[^{}]*\}\}/g;

/** A mask token written by maskPlaceholders. The index refers to the placeholder list. */
const MASK_TOKEN = /__PH(\d+)__/g;

/** Result of masking: the text with tokens in place of placeholders, and the original placeholders in order. */
export interface MaskedText {
  masked: string;
  placeholders: string[];
}

/**
 * Replaces every placeholder with a short ASCII token that translators keep unchanged.
 * @param text Original text, which may contain placeholders.
 * @returns The masked text and the placeholders it replaced.
 */
export function maskPlaceholders(text: string): MaskedText {
  const placeholders: string[] = [];
  const masked = text.replace(PLACEHOLDER, (match) => {
    placeholders.push(match);
    return `__PH${placeholders.length - 1}__`;
  });
  return { masked, placeholders };
}

/**
 * Puts the original placeholders back into a translated text.
 * Returns null when the translator changed the tokens: a token missing, repeated or unknown means the placeholders are not
 * intact, and the caller must not use the text. A literal "__PHn__" typed by the author also counts as unknown, so it is refused too.
 * @param translated Translator output that came from masked text.
 * @param placeholders Placeholders returned by maskPlaceholders.
 * @returns The text with the placeholders restored, or null when they are not intact.
 */
export function restorePlaceholders(translated: string, placeholders: readonly string[]): string | null {
  const seen = new Set<number>();
  for (const match of translated.matchAll(MASK_TOKEN)) {
    const index = Number(match[1]);
    if (index >= placeholders.length || seen.has(index)) return null;
    seen.add(index);
  }
  if (seen.size !== placeholders.length) return null;
  return translated.replace(MASK_TOKEN, (_token, index: string) => placeholders[Number(index)] ?? '');
}
