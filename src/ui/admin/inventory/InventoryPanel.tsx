// Inventory table: the rows of the page with their stock, one-tap +/- for small screens, selection for bulk changes, the
// adjustment drawer and the barcode lookup. Changes go through the adjust endpoint, and the rows then show the stock it reports.
import { useState } from 'preact/hooks';
import type { InventoryRow, InventoryTotals, StockChange } from '@/application/ports/inventory';
import { MAX_ADJUST_ITEMS, stockStatus } from '@/domain/inventory/stock';
import type { CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';
import { postJson } from '../lib/api-client';
import { BUTTON, BUTTON_PRIMARY, ERROR_TEXT, PANEL, TABLE_WRAP } from '../lib/classes';
import { BarcodeScanner } from './BarcodeScanner';
import { InventoryRowView } from './InventoryRowView';
import { StockAdjustDrawer } from './StockAdjustDrawer';
import {
  fill,
  moneyText,
  problemText,
  rowTitle,
  type AdjustValues,
  type InventoryLabels,
} from './inventory-view';

/** Props of the table. The first page of rows and the totals come from the server. */
export interface InventoryPanelProps {
  rows: InventoryRow[];
  totals: InventoryTotals;
  labels: InventoryLabels;
  locale: Locale;
  currency: CurrencyCode;
  country: string;
}

/**
 * The inventory table with its actions: totals, scanning, bulk selection, one-tap steps and the adjustment drawer.
 * @param props Rows, totals, labels and the money settings.
 */
export default function InventoryPanel(props: InventoryPanelProps) {
  const { labels, locale, currency, country } = props;
  const [rows, setRows] = useState(props.rows);
  const [selected, setSelected] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<InventoryRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedRows = rows.filter((row) => selected.includes(row.variantId));
  // The drawer edits one variant (from a row, a scan) or a whole selection; the title and subtitle depend on which.
  const single = drawer && drawer.length === 1 ? drawer[0] : undefined;

  /**
   * Applies one adjustment to the given variants and shows the stock the server reports.
   * @param targets Variants to change.
   * @param values What to change, and why.
   * @returns Whether the server saved the change.
   */
  async function apply(targets: InventoryRow[], values: AdjustValues): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await postJson<StockChange[]>('/api/admin/inventory/adjust', {
      items: targets.map((row) => ({
        variantId: row.variantId,
        mode: values.mode,
        value: values.value,
        expected: row.stock,
      })),
      reason: values.reason,
      note: values.note,
    });
    setBusy(false);
    if (!result.ok) {
      setError(problemText(labels, result.details));
      return false;
    }
    const changes = result.data;
    setRows((current) =>
      current.map((row) => {
        const change = changes.find((item) => item.variantId === row.variantId);
        if (!change) return row;
        return { ...row, stock: change.after, status: stockStatus(change.after, row.threshold, row.tracked) };
      }),
    );
    setNotice(labels.saved);
    return true;
  }

  /**
   * One-tap change of a single variant: +1 restocks, -1 removes a unit.
   * @param row Variant to change.
   * @param delta Units to add (negative removes).
   */
  function step(row: InventoryRow, delta: number) {
    void apply([row], {
      mode: 'delta',
      value: delta,
      reason: delta > 0 ? 'restock' : 'manual_adjust',
      note: null,
    });
  }

  /**
   * Adds a variant to the bulk selection, or removes it. The selection stops at the adjustment limit.
   * @param variantId Variant to toggle.
   */
  function toggle(variantId: string) {
    setNotice(null);
    if (selected.includes(variantId)) {
      setSelected(selected.filter((id) => id !== variantId));
    } else if (selected.length >= MAX_ADJUST_ITEMS) {
      setError(labels.selectionLimit);
    } else {
      setError(null);
      setSelected([...selected, variantId]);
    }
  }

  /**
   * Submits the drawer for its variants. The drawer closes once the change is saved.
   * @param values Adjustment from the form.
   */
  async function submitDrawer(values: AdjustValues) {
    if (!drawer) return;
    const saved = await apply(drawer, values);
    if (!saved) return;
    if (drawer.length > 1) setSelected([]);
    setDrawer(null);
  }

  return (
    <>
      <section class={PANEL} aria-label={labels.title}>
        <dl class="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt class="text-text/70">{labels.totalUnits}</dt>
            <dd class="text-lg font-semibold">{props.totals.units}</dd>
          </div>
          <div>
            <dt class="text-text/70">{labels.totalCost}</dt>
            <dd class="font-semibold">{moneyText(props.totals.costMinor, currency, locale, country)}</dd>
          </div>
          <div>
            <dt class="text-text/70">{labels.totalRetail}</dt>
            <dd class="font-semibold">{moneyText(props.totals.retailMinor, currency, locale, country)}</dd>
          </div>
        </dl>

        <BarcodeScanner
          labels={labels}
          onFound={(row) => {
            setError(null);
            setDrawer([row]);
          }}
        />

        {selected.length > 0 && (
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="font-semibold">{fill(labels.selectionCount, { count: selected.length })}</span>
            <button
              type="button"
              class={BUTTON_PRIMARY}
              disabled={busy}
              onClick={() => {
                setError(null);
                setDrawer(selectedRows);
              }}
            >
              {labels.adjustSelected}
            </button>
            <button type="button" class={BUTTON} onClick={() => setSelected([])}>
              {labels.clearSelection}
            </button>
          </div>
        )}
        {!drawer && error && (
          <p class={ERROR_TEXT} role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p class="text-sm" role="status">
            {notice}
          </p>
        )}

        <div class={TABLE_WRAP}>
          <table class="admin-table w-full text-sm">
            <thead>
              <tr>
                <th scope="col">{labels.columnSelect}</th>
                <th scope="col">{labels.columnProduct}</th>
                <th scope="col">{labels.columnSku}</th>
                <th scope="col">{labels.columnStock}</th>
                <th scope="col">{labels.columnThreshold}</th>
                <th scope="col">{labels.columnCost}</th>
                <th scope="col">{labels.columnStatus}</th>
                <th scope="col">
                  <span class="sr-only">{labels.columnActions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <InventoryRowView
                  key={row.variantId}
                  row={row}
                  labels={labels}
                  locale={locale}
                  currency={currency}
                  country={country}
                  selected={selected.includes(row.variantId)}
                  selectionFull={selected.length >= MAX_ADJUST_ITEMS}
                  busy={busy}
                  onToggle={() => toggle(row.variantId)}
                  onStep={(delta) => step(row, delta)}
                  onAdjust={() => {
                    setError(null);
                    setDrawer([row]);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p class="text-text/70 text-sm">{labels.empty}</p>}
      </section>

      {drawer && (
        <StockAdjustDrawer
          title={single ? labels.drawerTitle : fill(labels.bulkTitle, { count: drawer.length })}
          subtitle={
            single ? `${rowTitle(single)} · ${fill(labels.stockOnRecord, { count: single.stock })}` : null
          }
          labels={labels}
          busy={busy}
          error={error}
          onClose={() => {
            setError(null);
            setDrawer(null);
          }}
          onSubmit={(values) => void submitDrawer(values)}
        />
      )}
    </>
  );
}
