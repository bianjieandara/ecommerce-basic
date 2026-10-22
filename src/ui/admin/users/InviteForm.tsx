// Invitation form: email, name, role and the invitee's language. The server emails the link and sets an unusable password, so the
// owner never handles a password.
import { useState } from 'preact/hooks';
import { ROLES, type Role } from '@/domain/identity/role';
import { SUPPORTED_LOCALES, type Locale } from '@/domain/shared/locale';
import { postJson } from '@/ui/admin/lib/api-client';
import { BUTTON_PRIMARY, ERROR_TEXT, FIELD, LABEL } from '@/ui/admin/lib/classes';
import { issueMessages } from '@/ui/admin/lib/issue-messages';
import { refusalText, type UserLabels, type UserRowData } from './user-model';

/** Props of the invitation form. */
export interface InviteFormProps {
  labels: UserLabels;
  errors: Record<string, string>;
  /** The inviting admin's language, preselected for the invitee. */
  locale: Locale;
  onInvited: (user: UserRowData) => void;
}

/** The account the invite endpoint answers with. */
interface InvitedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

/**
 * Sends the invitation and shows what the server refused, field by field.
 * @param props Labels, error texts, the inviter's language and the callback for the new row.
 */
export default function InviteForm(props: InviteFormProps) {
  const { labels, errors } = props;
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [locale, setLocale] = useState<Locale>(props.locale);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  /**
   * Posts the invitation. A refusal keeps the typed values so the owner can correct them.
   * @param event Form submit event.
   */
  async function submit(event: Event) {
    event.preventDefault();
    setBusy(true);
    setSent(false);
    setMessage('');
    setFieldErrors({});
    const result = await postJson<{ user: InvitedUser }>('/api/admin/invites', { email, name, role, locale });
    setBusy(false);
    if (!result.ok) {
      const fields = issueMessages(result.details, labels.invite.invalid);
      setFieldErrors(fields);
      if (Object.keys(fields).length === 0) {
        setMessage(
          result.code === 'CONFLICT' ? labels.invite.emailTaken : refusalText(result.code, labels, errors),
        );
      }
      return;
    }
    const { id, name: invitedName, email: invitedEmail, role: invitedRole, isActive } = result.data.user;
    props.onInvited({
      id,
      name: invitedName,
      email: invitedEmail,
      role: invitedRole,
      isActive,
      lastLogin: labels.neverSignedIn,
    });
    setEmail('');
    setName('');
    setSent(true);
  }

  return (
    <form class="flex flex-col gap-4" onSubmit={submit} noValidate>
      <div class="grid gap-4 md:grid-cols-2">
        <label class={LABEL}>
          {labels.invite.email}
          <input
            class={FIELD}
            type="email"
            name="email"
            autoComplete="off"
            value={email}
            onInput={(event) => setEmail(event.currentTarget.value)}
          />
          {fieldErrors.email && <span class={ERROR_TEXT}>{fieldErrors.email}</span>}
        </label>
        <label class={LABEL}>
          {labels.invite.name}
          <input
            class={FIELD}
            name="name"
            value={name}
            onInput={(event) => setName(event.currentTarget.value)}
          />
          {fieldErrors.name && <span class={ERROR_TEXT}>{fieldErrors.name}</span>}
        </label>
        <label class={LABEL}>
          {labels.invite.role}
          <select
            class={FIELD}
            name="role"
            value={role}
            onChange={(event) => {
              const picked = ROLES.find((candidate) => candidate === event.currentTarget.value);
              if (picked) setRole(picked);
            }}
          >
            {ROLES.map((option) => (
              <option value={option}>{labels.roles[option]}</option>
            ))}
          </select>
        </label>
        <label class={LABEL}>
          {labels.invite.language}
          <select
            class={FIELD}
            name="locale"
            value={locale}
            onChange={(event) => {
              const picked = SUPPORTED_LOCALES.find((candidate) => candidate === event.currentTarget.value);
              if (picked) setLocale(picked);
            }}
          >
            {SUPPORTED_LOCALES.map((option) => (
              <option value={option}>{labels.languages[option]}</option>
            ))}
          </select>
        </label>
      </div>
      <div class="flex flex-col items-start gap-2">
        <button type="submit" class={BUTTON_PRIMARY} disabled={busy}>
          {busy ? labels.invite.sending : labels.invite.submit}
        </button>
        {sent && (
          <p role="status" class="text-sm">
            {labels.invite.sent}
          </p>
        )}
        {message && (
          <p role="alert" class={ERROR_TEXT}>
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
