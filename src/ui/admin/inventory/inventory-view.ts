// View helpers of the inventory screens: labels, status classes, money text and placeholders. The islands use these instead
// of importing ui/i18n, which would bundle both dictionaries into the browser.
import type { CurrencyCode } from '@/domain/shared/currency';
import { formatMoney } from '@/domain/shared/format';
import type { Locale } from '@/domain/shared/locale';
import { money } from '@/domain/shared/money';
import {
  MANUAL_STOCK_REASONS,
  type ManualStockReason,
  type StockProblem,
  type StockStatus,
} from '@/domain/inventory/stock';
import type { ImportRowCode } from '@/application/inventory/stock-import';
import type { Dictionary } from '@/ui/i18n';
import { BADGE, BADGE_TONE } from '../lib/classes';

/** Translated labels of the inventory screens: the admin dictionary's inventory namespace. */
export type InventoryLabels = Dictionary['admin']['inventory'];

/** Reasons the adjustment form offers. Initial stock, sales and cancellations come from the system, not from here. */
export type AdjustReason = ManualStockReason;

/** The reasons the adjustment form offers, in display order. */
export const ADJUST_REASONS: readonly AdjustReason[] = MANUAL_STOCK_REASONS;

/** Values the adjustment form produces. */
export interface AdjustValues {
  mode: 'delta' | 'set';
  value: number;
  reason: AdjustReason;
  note: string | null;
}

/**
 * Fills {placeholders} in a label. Same syntax as the server-side t(); repeated here because the islands cannot import it.
 * @param text Label with {name} placeholders.
 * @param values Values by name.
 * @returns The filled text. Unknown placeholders stay visible.
 */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}

/**
 * Translated name of a stock status.
 * @param labels Inventory labels.
 * @param status Stock status.
 * @returns The label.
 */
export function statusLabel(labels: InventoryLabels, status: StockStatus): string {
  const names: Record<StockStatus, string> = {
    in_stock: labels.statusInStock,
    low: labels.statusLow,
    out: labels.statusOut,
    untracked: labels.statusUntracked,
  };
  return names[status];
}

/**
 * Badge classes of a stock status. Low stock and sold out both warn; untracked stock is neutral.
 * @param status Stock status.
 * @returns The class string.
 */
export function statusClass(status: StockStatus): string {
  const tone = status === 'in_stock' ? 'ok' : status === 'untracked' ? 'muted' : 'warn';
  return `${BADGE} ${BADGE_TONE[tone]}`;
}

/**
 * Translated name of an adjustment reason.
 * @param labels Inventory labels.
 * @param reason Reason the form offers.
 * @returns The label.
 */
export function adjustReasonLabel(labels: InventoryLabels, reason: AdjustReason): string {
  const names: Record<AdjustReason, string> = {
    restock: labels.reasonRestock,
    manual_adjust: labels.reasonManual,
    return: labels.reasonReturn,
    damage: labels.reasonDamage,
  };
  return names[reason];
}

/**
 * Product name with its variant in brackets, as the drawer and the notices show it.
 * @param row Product and variant names.
 * @returns The title.
 */
export function rowTitle(row: { productName: string; variantLabel: string }): string {
  return row.variantLabel ? `${row.productName} (${row.variantLabel})` : row.productName;
}

/**
 * Money text of a stored amount in the store currency, or a dash when the amount is not set.
 * @param amountMinor Amount in minor units, or null.
 * @param currency Store currency.
 * @param locale Language of the admin.
 * @param country Store country.
 * @returns The formatted amount.
 */
export function moneyText(
  amountMinor: number | null,
  currency: CurrencyCode,
  locale: Locale,
  country: string,
): string {
  return amountMinor === null ? '—' : formatMoney(money(amountMinor, currency), locale, country);
}

/**
 * Message for a failed call to an inventory endpoint. The server sends codes in `details`, never text to show.
 * @param labels Inventory labels.
 * @param details The `details` of the failed call.
 * @returns The translated problem, or the generic failure text.
 */
export function problemText(labels: InventoryLabels, details: unknown): string {
  const reason = (details as { reason?: unknown } | null)?.reason;
  if (typeof reason === 'string' && reason in labels.problems) {
    return labels.problems[reason as StockProblem];
  }
  return labels.failed;
}

/**
 * Translated reason a CSV row (or the whole file) did not apply.
 * @param labels Inventory labels.
 * @param code Row code from the import result.
 * @returns The label.
 */
export function importRowText(labels: InventoryLabels, code: ImportRowCode | null): string {
  return code === null ? labels.csv.error : labels.csv.codes[code];
}

/**
 * Translated reason a whole CSV file was refused (before any row was read).
 * @param labels Inventory labels.
 * @param details The `details` of the failed call.
 * @returns The message, or the generic failure text.
 */
export function importFileText(labels: InventoryLabels, details: unknown): string {
  const info = details as { reason?: unknown; max?: unknown } | null;
  if (info?.reason === 'import_header') return labels.csv.fileHeader;
  if (info?.reason === 'import_rows') return fill(labels.csv.fileRows, { max: Number(info.max ?? 0) });
  return labels.csv.failed;
}
