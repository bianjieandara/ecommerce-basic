// Bulk bar of the product list (Preact island). It watches the selection boxes of the page (`input[data-bulk-id]`), shows how
// many are selected, and publishes or unpublishes all of them with one request. The list is server-rendered, so the island
// only reads the boxes; it does not draw them.
import { useEffect, useState } from 'preact/hooks';
import { postJson } from './lib/api-client';
import { ERROR_TEXT } from './lib/classes';

/** The two buttons sit on the dark bar, so they use its colours: an outline and a filled button. */
const BAR_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold disabled:opacity-50';
const BAR_OUTLINE = `${BAR_BUTTON} border border-on-primary/40 hover:border-on-primary`;
const BAR_FILLED = `${BAR_BUTTON} bg-on-primary text-primary hover:opacity-90`;

/** Props of the bulk bar. Labels arrive translated; `selected` holds the {count} placeholder. */
export interface ProductBulkBarProps {
  labels: { selected: string; publish: string; unpublish: string; failed: string; working: string };
}

/** Ids of the products whose box is ticked. */
function selectedIds(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>('input[data-bulk-id]:checked')].map(
    (box) => box.dataset.bulkId ?? '',
  );
}

/**
 * The bar that appears while at least one product is selected.
 * @param props Translated labels.
 */
export default function ProductBulkBar({ labels }: ProductBulkBarProps) {
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const read = () => setIds(selectedIds());
    document.addEventListener('change', read);
    return () => document.removeEventListener('change', read);
  }, []);

  /**
   * Sends the status change for the selection and reloads the list when it worked.
   * @param status New status of every selected product.
   */
  async function change(status: 'active' | 'archived') {
    setBusy(true);
    setFailed(false);
    const result = await postJson('/api/admin/products/bulk-status', { ids, status });
    if (result.ok) {
      window.location.reload();
      return;
    }
    setBusy(false);
    setFailed(true);
  }

  if (ids.length === 0) return null;
  return (
    <div
      role="region"
      aria-live="polite"
      class="rounded-card bg-primary text-on-primary fixed inset-x-3 bottom-6 z-30 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 p-3 pl-5 shadow-xl"
    >
      <span class="font-medium">{labels.selected.replace('{count}', String(ids.length))}</span>
      <span class="flex flex-wrap items-center gap-2">
        {failed && (
          <span role="alert" class={`${ERROR_TEXT} bg-background rounded-md px-2`}>
            {labels.failed}
          </span>
        )}
        <button type="button" class={BAR_OUTLINE} disabled={busy} onClick={() => change('archived')}>
          {busy ? labels.working : labels.unpublish}
        </button>
        <button type="button" class={BAR_FILLED} disabled={busy} onClick={() => change('active')}>
          {busy ? labels.working : labels.publish}
        </button>
      </span>
    </div>
  );
}
