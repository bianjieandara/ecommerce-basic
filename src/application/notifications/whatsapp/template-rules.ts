// Rules shared by the admin editor, the job handler and the Meta catalog: placeholder checks, parameter lookup from the
// notification context, the link suffix for a URL button, and the Meta language code of each store language.
import type { Locale } from '@/domain/shared/locale';

/** Longest body Meta accepts for a template. */
export const MAX_TEMPLATE_BODY_CHARS = 1024;

/** Longest value sent in one parameter. Meta rejects longer text. */
const MAX_PARAM_CHARS = 1000;

/** Meta's code for each store language. Templates are created and sent with the same code. */
export const META_LANGUAGE: Record<Locale, string> = { es: 'es', en: 'en' };

/** Why a body cannot be saved. The editor shows a translated line for each one. */
export type BodyIssue =
  'EMPTY' | 'TOO_LONG' | 'UNKNOWN_PLACEHOLDER' | 'MISSING_PLACEHOLDER' | 'STRAY_BRACES' | 'EDGE_VARIABLE';

/** Matches one {{...}} token and captures what is inside. */
const TOKEN = /\{\{([^{}]*)\}\}/g;

/**
 * Lists what is wrong with a body for a template with `paramCount` parameters. Every {{n}} must be a parameter that exists,
 * every parameter must appear, and the body must start and end with text.
 * @param body Body text as typed.
 * @param paramCount Number of parameters the template maps.
 * @returns Issues found; empty when the body is valid.
 */
export function bodyIssues(body: string, paramCount: number): BodyIssue[] {
  const text = body.trim();
  if (text === '') return ['EMPTY'];
  const issues = new Set<BodyIssue>();
  if (text.length > MAX_TEMPLATE_BODY_CHARS) issues.add('TOO_LONG');
  const tokens = [...text.matchAll(TOKEN)].map((match) => match[1] ?? '');
  const used = new Set<number>();
  for (const token of tokens) {
    if (!/^[1-9]\d*$/.test(token) || Number(token) > paramCount) issues.add('UNKNOWN_PLACEHOLDER');
    else used.add(Number(token));
  }
  for (let index = 1; index <= paramCount; index += 1) {
    if (!used.has(index)) issues.add('MISSING_PLACEHOLDER');
  }
  if (/[{}]/.test(text.replace(TOKEN, ''))) issues.add('STRAY_BRACES');
  if (/^\{\{[^{}]*\}\}|\{\{[^{}]*\}\}$/.test(text)) issues.add('EDGE_VARIABLE');
  return [...issues];
}

/**
 * Reads one context value by its dot path. Only text and numbers count; anything else is an empty value.
 * @param root Notification context.
 * @param path Dot path, for example "order.number".
 * @returns The value as text, or "" when the path names nothing printable.
 */
export function valueAt(root: unknown, path: string): string {
  let node: unknown = root;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return '';
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  return '';
}

/**
 * Values for the template parameters, in the template's order.
 * @param paths Context paths, params[i] for {{i+1}}.
 * @param context Notification context.
 * @returns Text values, one per path.
 */
export function paramValues(paths: readonly string[], context: unknown): string[] {
  return paths.map((path) => valueAt(context, path));
}

/**
 * Makes a value safe for a Meta text parameter: no line breaks or tabs, no runs of spaces, never empty, and short enough.
 * @param value Raw value.
 * @returns The parameter text.
 */
export function toMetaParam(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, MAX_PARAM_CHARS);
  return cleaned === '' ? '-' : cleaned;
}

/**
 * The part of a link after the site's domain, which is what a URL button's {{1}} takes. Null for a value that is not a URL.
 * @param url Absolute link from the notification context.
 * @returns Path and query without the leading slash, or null.
 */
export function buttonSuffixOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname.replace(/^\//, '')}${parsed.search}`;
  } catch {
    return null;
  }
}

/**
 * Fills {{n}} with values, for previews and logs. Tokens without a value stay as typed.
 * @param body Template body.
 * @param values Parameter values, in order.
 * @returns The text a customer would read.
 */
export function renderBody(body: string, values: readonly string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (token, index: string) => values[Number(index) - 1] ?? token);
}
