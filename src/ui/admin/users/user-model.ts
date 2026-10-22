// Shapes the user manager works with. The page builds the rows, so the island never reads the database, and the refusal text
// lives here so every control in the screen answers a refused change the same way.
import type { Role } from '@/domain/identity/role';
import type { Dictionary } from '@/ui/i18n';

/** The strings of the user screen (the `admin.users` part of the dictionary). */
export type UserLabels = Dictionary['admin']['users'];

/** One admin account as the table shows it. */
export interface UserRowData {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  /** Last sign-in, already formatted by the page; the never-signed-in text for an account that has not signed in. */
  lastLogin: string;
}

/**
 * Text for a refused change. The last-owner refusal gets its own sentence, because it is the one an owner can act on.
 * @param code Error code the endpoint answered with.
 * @param labels User screen strings.
 * @param errors Shared error texts keyed by code.
 * @returns The message to show.
 */
export function refusalText(code: string, labels: UserLabels, errors: Record<string, string>): string {
  if (code === 'INVALID_STATE') return labels.lastOwner;
  return errors[code] ?? errors.generic ?? '';
}
