// Owner's user screen: the invitation form and the table of admin accounts. The page passes the accounts, and every change is
// checked again by the server, so this island only keeps its own list in step with the answers.
import { useState } from 'preact/hooks';
import type { Locale } from '@/domain/shared/locale';
import { HEADING, PANEL, TABLE_WRAP } from '@/ui/admin/lib/classes';
import InviteForm from './InviteForm';
import UserRow from './UserRow';
import type { UserLabels, UserRowData } from './user-model';

/** Props of the user screen. */
export interface UserManagerProps {
  users: UserRowData[];
  /** The signed-in owner's id, to mark and lock their own row. */
  selfId: string;
  locale: Locale;
  labels: UserLabels;
  errors: Record<string, string>;
}

/**
 * Invitation form above the account table.
 * @param props Accounts, the signed-in id, language, strings and error texts.
 */
export default function UserManager(props: UserManagerProps) {
  const { labels, errors, selfId, locale } = props;
  const [rows, setRows] = useState(props.users);

  return (
    <div class="flex flex-col gap-6">
      <section class={PANEL} aria-labelledby="invite-heading">
        <h2 id="invite-heading" class={HEADING}>
          {labels.invite.title}
        </h2>
        <InviteForm
          labels={labels}
          errors={errors}
          locale={locale}
          onInvited={(user) => setRows((current) => [...current, user])}
        />
      </section>
      <div class={TABLE_WRAP}>
        <table class="admin-table w-full text-sm">
          <thead>
            <tr>
              <th scope="col">{labels.columns.name}</th>
              <th scope="col">{labels.columns.email}</th>
              <th scope="col">{labels.columns.role}</th>
              <th scope="col">{labels.columns.active}</th>
              <th scope="col">{labels.columns.lastLogin}</th>
              <th scope="col">{labels.columns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelf={user.id === selfId}
                labels={labels}
                errors={errors}
                onChange={(updated) =>
                  setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)))
                }
                onDelete={(id) => setRows((current) => current.filter((row) => row.id !== id))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
