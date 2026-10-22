// Quick actions of one product in the list: publish or unpublish, and duplicate. Each posts to its endpoint and reports back.
import { useState } from 'preact/hooks';
import { postJson } from './lib/api-client';
import { ERROR_TEXT, LINK_BUTTON } from './lib/classes';

/** Props of the row actions. The labels are the few strings this row needs, so each row stays small. */
export interface RowActionsProps {
  productId: string;
  status: 'draft' | 'active' | 'archived';
  labels: { publish: string; unpublish: string; duplicate: string; working: string; failed: string };
}

/**
 * Publish or unpublish, and duplicate, for one product row.
 * @param props Product id, status and labels.
 */
export default function RowActions(props: RowActionsProps) {
  const { productId, labels } = props;
  const [status, setStatus] = useState(props.status);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const next = status === 'active' ? 'archived' : 'active';

  /**
   * Runs one action and reports failures in the row.
   * @param action Async action that returns whether it worked.
   */
  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    setFailed(false);
    const ok = await action();
    setBusy(false);
    setFailed(!ok);
  }

  return (
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class={LINK_BUTTON}
        disabled={busy}
        onClick={() =>
          run(async () => {
            const result = await postJson('/api/admin/products/status', { id: productId, status: next });
            if (result.ok) setStatus(next);
            return result.ok;
          })
        }
      >
        {busy ? labels.working : status === 'active' ? labels.unpublish : labels.publish}
      </button>
      <button
        type="button"
        class={LINK_BUTTON}
        disabled={busy}
        onClick={() =>
          run(async () => {
            const result = await postJson<{ id: string }>('/api/admin/products/duplicate', { id: productId });
            if (result.ok) window.location.assign(`/admin/products/${result.data.id}`);
            return result.ok;
          })
        }
      >
        {labels.duplicate}
      </button>
      {failed && (
        <span role="alert" class={ERROR_TEXT}>
          {labels.failed}
        </span>
      )}
    </div>
  );
}
