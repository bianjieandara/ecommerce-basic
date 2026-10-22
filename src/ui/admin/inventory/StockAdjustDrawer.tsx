// Adjustment drawer: a native dialog holding the stock form, for one variant or for a selection. It opens when it mounts and
// closes the way the cart drawer does: the close button, Escape, or a click on the backdrop.
import { useEffect, useRef } from 'preact/hooks';
import { StockAdjustForm } from './StockAdjustForm';
import type { AdjustValues, InventoryLabels } from './inventory-view';

/** Props of the drawer. */
export interface StockAdjustDrawerProps {
  title: string;
  subtitle: string | null;
  labels: InventoryLabels;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: AdjustValues) => void;
}

/**
 * Native dialog with the adjustment form. The parent unmounts it to close it, which also leaves the top layer.
 * @param props Title, labels, state and handlers.
 */
export function StockAdjustDrawer(props: StockAdjustDrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={props.onClose}
      onClick={(event) => {
        if (event.target === dialog.current) props.onClose();
      }}
      class="bg-background text-text backdrop:bg-text/40 m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-2xl p-0 sm:max-w-md sm:rounded-2xl"
      aria-labelledby="stock-drawer-title"
    >
      <div class="flex flex-col gap-4 p-4">
        <header class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="stock-drawer-title" class="text-lg font-semibold">
              {props.title}
            </h2>
            {props.subtitle && <p class="text-text/70 text-sm">{props.subtitle}</p>}
          </div>
          <button
            type="button"
            class="min-h-11 min-w-11 shrink-0 rounded-full text-xl"
            aria-label={props.labels.close}
            onClick={props.onClose}
          >
            ×
          </button>
        </header>
        <StockAdjustForm
          labels={props.labels}
          busy={props.busy}
          error={props.error}
          onSubmit={props.onSubmit}
        />
      </div>
    </dialog>
  );
}
