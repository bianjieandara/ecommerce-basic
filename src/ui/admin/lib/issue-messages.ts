// Turns the field issues of a refused save into messages keyed by path, so each form control can show its own refusal.

/**
 * Reads the field issues of a refused save.
 * @param details Details of the refused call: `{ issues: [{ path, message }] }`.
 * @param invalid Message shown for every refused field.
 * @returns Messages keyed by path.
 */
export function issueMessages(details: unknown, invalid: string): Record<string, string> {
  const issues = (details as { issues?: { path: string }[] } | null)?.issues ?? [];
  return Object.fromEntries(issues.map((issue) => [issue.path, invalid]));
}
