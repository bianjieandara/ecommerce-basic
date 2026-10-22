// Turns the cells of a report view into text in the admin's language and the store's currency. Every figure on a report screen
// passes through here, so a KPI card and a table row of the same number read the same.
import type { CellValue } from '@/application/reports/view';
import type { Locale } from '@/domain/shared/locale';
import type { CurrencyCode } from '@/domain/shared/currency';
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/domain/shared/format';
import { money } from '@/domain/shared/money';
import { t } from '@/ui/i18n';

/** What formatting needs: the language, the store's number and date settings, and its currency. */
export interface FormatContext {
  lang: Locale;
  country: string;
  currency: CurrencyCode;
  timeZone: string;
}

/**
 * One cell as text.
 * @param cell Cell of the view.
 * @param ctx Formatting context.
 * @returns The text shown.
 */
export function formatCell(cell: CellValue, ctx: FormatContext): string {
  switch (cell.kind) {
    case 'money':
      return formatMoney(money(cell.minor, ctx.currency), ctx.lang, ctx.country);
    case 'count':
      return formatNumber(cell.value, ctx.lang, ctx.country);
    case 'bp':
      return formatPercent(cell.value, ctx.lang, ctx.country);
    case 'text':
      return cell.value;
    case 'day':
      // Noon UTC keeps the store-local date the same in every time zone the store can use.
      return formatDate(`${cell.value}T12:00:00Z`, ctx.lang, ctx.country, ctx.timeZone);
    case 'empty':
      return t(ctx.lang, 'admin.reports.changeNone');
  }
}

/**
 * A change in basis points as text with its sign, for example "+12,5%".
 * @param bp Change in basis points.
 * @param ctx Formatting context.
 * @returns The text.
 */
export function formatChange(bp: number, ctx: FormatContext): string {
  return `${bp > 0 ? '+' : ''}${formatPercent(bp, ctx.lang, ctx.country)}`;
}
