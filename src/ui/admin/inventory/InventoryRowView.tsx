// One row of the inventory table. Below the md breakpoint the row becomes a card (admin-table.css), and the +/- buttons sit in it
// at 44px touch targets, so one tap changes a count from a phone.
import type { InventoryRow } from '@/application/ports/inventory';
import type { CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';
import { ADMIN_PATHS, PATHS } from '@/domain/shared/paths';
import { BUTTON, LINK_BUTTON, STEP_BUTTON } from '../lib/classes';
import { fill, moneyText, rowTitle, statusClass, statusLabel, type InventoryLabels } from './inventory-view';

/** Props of one row. */
export interface InventoryRowViewProps {
  row: InventoryRow;
  labels: InventoryLabels;
  locale: Locale;
  currency: CurrencyCode;
  country: string;
  selected: boolean;
  /** True when the selection already holds the most variants one adjustment can change. */
  selectionFull: boolean;
  busy: boolean;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onAdjust: () => void;
}

/**
 * One variant: its image and names, stock, threshold, cost, status and the actions.
 * @param props The row, its labels and the handlers.
 */
export function InventoryRowView(props: InventoryRowViewProps) {
  const { row, labels } = props;
  const name = rowTitle(row);
  return (
    <tr>
      <td data-label={labels.columnSelect}>
        <label class="flex min-h-11 min-w-11 items-center justify-center">
          <input
            type="checkbox"
            class="size-5"
            checked={props.selected}
            disabled={!row.tracked || (!props.selected && props.selectionFull)}
            aria-label={fill(labels.selectRow, { name })}
            onChange={props.onToggle}
          />
        </label>
      </td>
      <td data-label={labels.columnProduct}>
        <div class="flex items-center gap-3">
          {row.thumbKey ? (
            <img
              src={PATHS.media(row.thumbKey)}
              alt=""
              width="48"
              height="48"
              loading="lazy"
              class="rounded-brand size-12 shrink-0 object-cover"
            />
          ) : (
            <span aria-hidden="true" class="rounded-brand bg-text/10 size-12 shrink-0" />
          )}
          <div class="min-w-0">
            <p class="font-semibold">{row.productName}</p>
            {row.variantLabel && <p class="text-text/70 text-xs">{row.variantLabel}</p>}
          </div>
        </div>
      </td>
      <td data-label={labels.columnSku}>{row.sku ?? '—'}</td>
      <td data-label={labels.columnStock}>
        <strong>{row.tracked ? row.stock : '—'}</strong>
      </td>
      <td data-label={labels.columnThreshold}>{row.tracked ? row.threshold : '—'}</td>
      <td data-label={labels.columnCost}>
        {moneyText(row.costMinor, props.currency, props.locale, props.country)}
      </td>
      <td data-label={labels.columnStatus}>
        <span class={statusClass(row.status)}>{statusLabel(labels, row.status)}</span>
      </td>
      <td data-label={labels.columnActions}>
        <div class="flex flex-wrap items-center gap-2">
          {row.tracked && (
            <>
              <button
                type="button"
                class={STEP_BUTTON}
                aria-label={labels.minusOne}
                disabled={props.busy || row.stock <= 0}
                onClick={() => props.onStep(-1)}
              >
                −
              </button>
              <button
                type="button"
                class={STEP_BUTTON}
                aria-label={labels.plusOne}
                disabled={props.busy}
                onClick={() => props.onStep(1)}
              >
                +
              </button>
            </>
          )}
          <button type="button" class={BUTTON} disabled={!row.tracked} onClick={props.onAdjust}>
            {labels.adjust}
          </button>
          <a
            href={`${ADMIN_PATHS.inventoryMovements}?variant=${encodeURIComponent(row.variantId)}`}
            class={LINK_BUTTON}
          >
            {labels.history}
          </a>
        </div>
      </td>
    </tr>
  );
}
