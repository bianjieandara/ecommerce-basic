// One admin account in the user table. A change is saved at once; the server's answer decides what the row shows, and a refused
// change puts the controls back to their stored values.
import { useState } from 'preact/hooks';
import { ROLES, type Role } from '@/domain/identity/role';
import { postJson } from '@/ui/admin/lib/api-client';
import { ERROR_TEXT, FIELD, LINK_BUTTON } from '@/ui/admin/lib/classes';
import { refusalText, type UserLabels, type UserRowData } from './user-model';

/** Props of one account row. */
export interface UserRowProps {
  user: UserRowData;
  /** The signed-in owner's own row: its controls are disabled, because the server refuses those changes too. */
  isSelf: boolean;
  labels: UserLabels;
  errors: Record<string, string>;
  onChange: (user: UserRowData) => void;
  onDelete: (id: string) => void;
}

/**
 * One row: name, email, role, active toggle, last sign-in and delete.
 * @param props Account, labels and the callbacks that keep the table in step.
 */
export default function UserRow(props: UserRowProps) {
  const { user, isSelf, labels, errors } = props;
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  // Bumped after a refusal, so the select and the checkbox are redrawn from the stored values, not from the choice just made.
  const [version, setVersion] = useState(0);
  const locked = busy || isSelf;

  /**
   * Sends one change and applies the answer.
   * @param body The new role, or the new active flag.
   */
  async function change(body: { role: Role } | { isActive: boolean }) {
    setBusy(true);
    setSaved(false);
    setMessage('');
    const result = await postJson<{ user: { role: Role; isActive: boolean } }>(
      `/api/admin/users/${user.id}`,
      body,
    );
    setBusy(false);
    if (result.ok) {
      props.onChange({ ...user, role: result.data.user.role, isActive: result.data.user.isActive });
      setSaved(true);
      return;
    }
    setMessage(refusalText(result.code, labels, errors));
    setVersion((current) => current + 1);
  }

  /** Asks once, then deletes the account. */
  async function remove() {
    if (!window.confirm(labels.confirmDelete)) return;
    setBusy(true);
    setMessage('');
    const result = await postJson(`/api/admin/users/${user.id}/delete`, {});
    setBusy(false);
    if (result.ok) props.onDelete(user.id);
    else setMessage(refusalText(result.code, labels, errors));
  }

  return (
    <tr>
      <td data-label={labels.columns.name}>
        <span class="font-semibold break-words">{user.name}</span>
        {isSelf && <span class="text-text/70 ms-2 text-xs">({labels.you})</span>}
      </td>
      <td data-label={labels.columns.email} class="break-all">
        {user.email}
      </td>
      <td data-label={labels.columns.role}>
        <select
          key={`role-${version}`}
          class={FIELD}
          value={user.role}
          disabled={locked}
          aria-label={labels.columns.role}
          onChange={(event) => {
            const role = ROLES.find((candidate) => candidate === event.currentTarget.value);
            if (role) void change({ role });
          }}
        >
          {ROLES.map((role) => (
            <option value={role}>{labels.roles[role]}</option>
          ))}
        </select>
      </td>
      <td data-label={labels.columns.active}>
        <label class="inline-flex min-h-11 items-center gap-2">
          <input
            key={`active-${version}`}
            type="checkbox"
            class="size-5"
            checked={user.isActive}
            disabled={locked}
            onChange={(event) => void change({ isActive: event.currentTarget.checked })}
          />
          <span>{user.isActive ? labels.activeOn : labels.activeOff}</span>
        </label>
      </td>
      <td data-label={labels.columns.lastLogin}>{user.lastLogin}</td>
      <td data-label={labels.columns.actions}>
        <div class="flex flex-col items-start gap-1">
          <button type="button" class={LINK_BUTTON} disabled={locked} onClick={remove}>
            {busy ? labels.deleting : labels.delete}
          </button>
          {saved && (
            <span role="status" class="text-sm">
              {labels.saved}
            </span>
          )}
          {message && (
            <span role="alert" class={ERROR_TEXT}>
              {message}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
