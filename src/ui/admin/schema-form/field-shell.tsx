// Frame of one schema control: it shows the message the server gave for the field. Kept apart from SchemaControl to keep that file short.
import { ERROR_TEXT } from '@/ui/admin/lib/classes';

/**
 * Whether the server refused the field, or one of its parts (a language of a localized field, a nested value).
 * @param errors Messages keyed by path.
 * @param path Dotted path of the field.
 * @returns True when a message is keyed by the path or below it.
 */
export function refused(errors: Record<string, string>, path: string): boolean {
  return Object.keys(errors).some((key) => key === path || key.startsWith(`${path}.`));
}

/**
 * Shows one field and its message, if the server refused it.
 * @param props Field label, message and control.
 * @returns The field.
 */
export function Shell(props: { error?: string; children: unknown }) {
  return (
    <div class="flex flex-col gap-1">
      {props.children}
      {props.error && <p class={ERROR_TEXT}>{props.error}</p>}
    </div>
  );
}
