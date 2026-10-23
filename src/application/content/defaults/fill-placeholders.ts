// Placeholder replacement for default texts (legal pages, email defaults). One function, used everywhere.
// Unknown placeholders are left in place so a missing variable is visible instead of silently blank.

/**
 * Replaces `{{name}}` placeholders with values from a map.
 * @param template Text containing placeholders.
 * @param vars Values by name. Values are inserted as-is; callers escape HTML before this step when needed.
 * @returns The text with known placeholders replaced.
 */
export function fillPlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, name: string) => vars[name] ?? match);
}

/**
 * Fills the placeholders in every text of a page's sections, however deep: strings, lists and objects are walked, and
 * everything else is returned as it is.
 * @param value Sections (or any part of them).
 * @param vars Values by name; a name without a value leaves its placeholder visible.
 * @returns A copy with the known placeholders replaced.
 */
export function fillSectionPlaceholders<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === 'string') return fillPlaceholders(value, vars) as T;
  if (Array.isArray(value)) return value.map((item) => fillSectionPlaceholders(item, vars)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fillSectionPlaceholders(item, vars)]),
    ) as T;
  }
  return value;
}
