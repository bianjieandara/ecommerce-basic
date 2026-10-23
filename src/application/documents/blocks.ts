// Email blocks: fragments that a template inserts with {{block:name}}. Each block reads one part of the notification
// context and renders email-safe table markup. A block returns '' when it has nothing to show, so an empty block leaves
// no gap in the message.
import type { NotificationContext } from '../notifications/context';
import { emailButton } from './email-layout';
import { EMAIL_LABELS } from './email-labels';
import { escapeHtml } from './html';
import { renderMarkdown } from './markdown';

/** Renders one block from the notification context. */
export type BlockRenderer = (context: NotificationContext) => string;

/** Column alignment inside a block table. */
type Align = 'left' | 'center' | 'right';

/**
 * Renders a table from plain text. Cells are escaped here, so callers pass raw values.
 * @param head Header labels; empty for a table without a header row.
 * @param rows Body rows, one string per cell.
 * @param align Alignment per column.
 * @param emphasizeLast Makes the last row bold (used for totals).
 * @returns Table markup.
 */
function dataTable(head: string[], rows: string[][], align: Align[], emphasizeLast = false): string {
  const cell = (tag: 'th' | 'td', value: string, column: number, style: string) =>
    `<${tag} align="${align[column] ?? 'left'}" style="padding:8px 4px;${style}">${escapeHtml(value).replace(/\n/g, '<br>')}</${tag}>`;
  const headRow =
    head.length > 0
      ? `<tr>${head.map((label, column) => cell('th', label, column, 'border-bottom:2px solid #111111;font-weight:600')).join('')}</tr>`
      : '';
  const bodyRows = rows
    .map((row, index) => {
      const weight = emphasizeLast && index === rows.length - 1 ? 'font-weight:700;' : '';
      return `<tr>${row.map((value, column) => cell('td', value, column, `border-bottom:1px solid #eeeeee;${weight}`)).join('')}</tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font:14px/1.4 Arial,sans-serif;color:#111111">${headRow}${bodyRows}</table>`;
}

/**
 * Product name with its variant, for table cells.
 * @param name Product name.
 * @param variant Variant label, possibly empty.
 * @returns Combined text.
 */
function withVariant(name: string, variant: string): string {
  return variant ? `${name} · ${variant}` : name;
}

/**
 * Button for a block's link. Renders nothing when the link is missing.
 * @param label Button text.
 * @param url Absolute link.
 * @param color Brand colour.
 * @returns Button markup or ''.
 */
function button(label: string, url: string, color: string): string {
  return url ? emailButton(label, url, color) : '';
}

const orderItems: BlockRenderer = ({ locale, order }) => {
  if (order.items.length === 0) return '';
  const labels = EMAIL_LABELS[locale];
  return dataTable(
    [labels.item, labels.qty, labels.amount],
    order.items.map((item) => [withVariant(item.name, item.variant), String(item.quantity), item.lineTotal]),
    ['left', 'center', 'right'],
  );
};

const orderTotals: BlockRenderer = ({ locale, order }) => {
  const { totals } = order;
  if (!totals.total) return '';
  const labels = EMAIL_LABELS[locale];
  return dataTable(
    [],
    [
      [labels.subtotal, totals.subtotal],
      [totals.taxLabel, totals.tax],
      [labels.shipping, totals.shipping],
      [labels.total, totals.total],
    ],
    ['left', 'right'],
    true,
  );
};

const shippingAddress: BlockRenderer = ({ locale, order }) => {
  if (order.address.length === 0) return '';
  const lines = order.address.map((line) => escapeHtml(line)).join('<br>');
  return `<p style="margin:16px 0 4px;font-weight:600">${escapeHtml(EMAIL_LABELS[locale].shipTo)}</p><p style="margin:0">${lines}</p>`;
};

const bankInstructions: BlockRenderer = ({ order }) =>
  order.bankInstructions
    ? `<div style="margin:16px 0;padding:12px 16px;border-radius:6px;background:#f5f5f5">${renderMarkdown(order.bankInstructions)}</div>`
    : '';

const orderButton: BlockRenderer = ({ locale, store, order }) =>
  button(EMAIL_LABELS[locale].viewOrder, order.url, store.primaryColor);

const resetButton: BlockRenderer = ({ locale, store, admin }) =>
  button(EMAIL_LABELS[locale].resetPassword, admin.resetUrl, store.primaryColor);

const inviteButton: BlockRenderer = ({ locale, store, admin }) =>
  button(EMAIL_LABELS[locale].acceptInvite, admin.inviteUrl, store.primaryColor);

const productButton: BlockRenderer = ({ locale, store, product }) =>
  button(EMAIL_LABELS[locale].viewProduct, product.url, store.primaryColor);

const reportButton: BlockRenderer = ({ locale, store, report }) =>
  button(EMAIL_LABELS[locale].openReports, report.url, store.primaryColor);

const lowStockTable: BlockRenderer = ({ locale, stock }) => {
  if (stock.items.length === 0) return '';
  const labels = EMAIL_LABELS[locale];
  return dataTable(
    [labels.item, labels.sku, labels.stock, labels.minimum],
    stock.items.map((row) => [
      withVariant(row.name, row.variant),
      row.sku,
      String(row.stock),
      String(row.threshold),
    ]),
    ['left', 'left', 'right', 'right'],
  );
};

const kpiTable: BlockRenderer = ({ locale, report }) => {
  if (report.kpis.length === 0) return '';
  const labels = EMAIL_LABELS[locale];
  return dataTable(
    [labels.indicator, labels.value, labels.change],
    report.kpis.map((kpi) => [kpi.label, kpi.value, kpi.delta]),
    ['left', 'right', 'right'],
  );
};

/** Every block a template may insert. An email lists the blocks its copy uses; validation rejects any other name. */
export const EMAIL_BLOCKS = {
  orderItems,
  orderTotals,
  shippingAddress,
  bankInstructions,
  orderButton,
  resetButton,
  inviteButton,
  productButton,
  reportButton,
  lowStockTable,
  kpiTable,
} satisfies Record<string, BlockRenderer>;

/** Name of a block, as written in a template: {{block:name}}. */
export type BlockName = keyof typeof EMAIL_BLOCKS;
