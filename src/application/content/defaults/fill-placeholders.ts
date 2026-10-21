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
