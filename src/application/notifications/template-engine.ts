// Template engine for notification emails. Authors write Markdown with a few placeholders: {{path}} for values,
// {{#if path}}...{{else}}...{{/if}} for optional text and {{block:name}} for whitelisted HTML blocks. The Markdown becomes
// HTML first. Values are escaped, and each kind of placeholder is filled in one pass, so inserted data is never scanned
// again and cannot form new placeholders.
import { escapeHtml } from '../documents/html';
import { renderMarkdown } from '../documents/markdown';

/** Longest body accepted when a template is saved. */
export const MAX_BODY_CHARS = 20_000;

/** Longest subject accepted when a template is saved. */
export const MAX_SUBJECT_CHARS = 200;

/** The variables and blocks one template may use. */
export interface TemplateRules {
  variables: readonly string[];
  blocks: readonly string[];
}

/** {{path}}. Names start with a letter, so {{#if}}, {{/if}}, {{else}} and {{block:...}} never match. */
const VARIABLE = /\{\{\s*([a-zA-Z][\w.]*)\s*\}\}/g;
/** A complete conditional. Nesting is not supported; validation rejects it. */
const CONDITIONAL = /\{\{#if\s+([a-zA-Z][\w.]*)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
/** {{block:name}}. A paragraph that holds only a block is replaced as a whole, so no empty paragraph remains. */
const BLOCK = /<p>\s*\{\{block:\s*([a-zA-Z]\w*)\s*\}\}\s*<\/p>|\{\{block:\s*([a-zA-Z]\w*)\s*\}\}/g;
/** Any {{...}} token, scanned during validation to catch typos. */
const ANY_TOKEN = /\{\{[\s\S]*?\}\}/g;
/** Single-token patterns. They have no global flag, so they are safe to reuse. */
const TOKEN_VARIABLE = /^\{\{\s*([a-zA-Z][\w.]*)\s*\}\}$/;
const TOKEN_IF = /^\{\{#if\s+([a-zA-Z][\w.]*)\s*\}\}$/;
const TOKEN_BLOCK = /^\{\{block:\s*([a-zA-Z]\w*)\s*\}\}$/;
const TOKEN_STRUCTURE = /^\{\{(?:else|\/if)\}\}$/;
/** Conditional tags that remain after complete conditionals are removed. */
const CONDITIONAL_TAG = /\{\{\s*(?:#if|\/if|else\b)/;

/**
 * Value at a dot path (`order.number` reads context.order.number).
 * @param context Root object.
 * @param path Dot-separated path.
 * @returns The value, or undefined when a step is missing.
 */
function lookup(context: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current === null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, context);
}

/**
 * Text for a value. Only strings, numbers and booleans are printed; anything else is empty.
 * @param value Value from the context.
 * @returns Plain text.
 */
function toText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

/**
 * Escapes a value for the HTML body. Braces are escaped as well, so data can never form a placeholder.
 * @param value Plain text.
 * @returns Escaped text.
 */
function escapeValue(value: string): string {
  return escapeHtml(value).replace(/[{}]/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Truthiness used by conditionals: empty text, 0, false, null and empty lists count as absent.
 * @param value Value from the context.
 * @returns Whether the conditional's text is shown.
 */
function isPresent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '' && value !== 0 && value !== false;
}

/**
 * Renders a body template to HTML for the email layout.
 * @param source Markdown body with placeholders.
 * @param context Values for variables and conditionals.
 * @param blocks Block renderers by name. An unknown name renders nothing (validation rejects it when saving).
 * @returns HTML.
 */
export function renderTemplate<C extends object>(
  source: string,
  context: C,
  blocks: Readonly<Record<string, (context: C) => string>>,
): string {
  const html = renderMarkdown(source)
    .replace(CONDITIONAL, (_match, path: string, whenTrue: string, whenFalse?: string) =>
      isPresent(lookup(context, path)) ? whenTrue : (whenFalse ?? ''),
    )
    .replace(VARIABLE, (_match, path: string) => escapeValue(toText(lookup(context, path))));
  return html.replace(BLOCK, (_match, wrapped?: string, bare?: string) => {
    const name = wrapped ?? bare ?? '';
    return blocks[name]?.(context) ?? '';
  });
}

/**
 * Renders a subject line: plain text with variables only, on one line, capped in length.
 * @param source Subject template.
 * @param context Values for variables.
 * @returns Subject text.
 */
export function renderSubject(source: string, context: object): string {
  return source
    .replace(VARIABLE, (_match, path: string) => toText(lookup(context, path)))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SUBJECT_CHARS);
}

/**
 * Checks a subject or body against the variables and blocks its email allows. Typos are reported, never ignored.
 * @param source Template text.
 * @param rules Allowed variables and blocks.
 * @param kind 'subject' (plain text, variables only) or 'body' (variables, conditionals and blocks).
 * @returns Problems found. An empty list means the template is valid.
 */
export function validateTemplate(source: string, rules: TemplateRules, kind: 'subject' | 'body'): string[] {
  const problems = new Set<string>();
  const limit = kind === 'body' ? MAX_BODY_CHARS : MAX_SUBJECT_CHARS;
  if (source.length > limit) problems.add(`The ${kind} is longer than ${limit} characters`);
  if (kind === 'subject' && /[\r\n]/.test(source)) problems.add('The subject must be a single line');
  if (kind === 'subject' && CONDITIONAL_TAG.test(source))
    problems.add('Conditionals are not allowed in subjects');
  if (kind === 'body' && CONDITIONAL_TAG.test(source.replace(CONDITIONAL, ''))) {
    problems.add('Conditionals must be closed and cannot be nested');
  }

  for (const match of source.matchAll(ANY_TOKEN)) {
    const token = match[0];
    // {{else}} matches the variable pattern too, so the structure tags are accepted first.
    if (TOKEN_STRUCTURE.test(token)) continue;
    const path = TOKEN_VARIABLE.exec(token)?.[1] ?? TOKEN_IF.exec(token)?.[1];
    if (path !== undefined) {
      if (!rules.variables.includes(path)) problems.add(`Unknown variable: ${path}`);
      continue;
    }
    const name = TOKEN_BLOCK.exec(token)?.[1];
    if (name !== undefined) {
      if (kind === 'subject') problems.add('Blocks are not allowed in subjects');
      else if (!rules.blocks.includes(name)) problems.add(`Unknown block: ${name}`);
      continue;
    }
    problems.add(`Invalid placeholder: ${token}`);
  }
  return [...problems];
}
