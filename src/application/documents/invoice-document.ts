// Invoice document: one self-contained A4 page. The stored PDF, the customer's download and any print view use this same
// HTML. The snapshot saved with the invoice is printed as it is; nothing is read again from the catalog.
import { formatInvoiceNumber } from '@/domain/invoicing/invoice';
import { formatDate, formatMoney } from '@/domain/shared/format';
import type { Locale } from '@/domain/shared/locale';
import { money } from '@/domain/shared/money';
import type { Invoice } from '../ports/invoicing';
import { escapeHtml } from './html';

/** Store values the invoice shows. */
export interface InvoiceDocumentOptions {
  storeName: string;
  country: string;
  timeZone: string;
  primaryColor: string;
  footerNotes: string;
}

/** Fixed wording of the invoice, per language. */
const LABELS: Record<
  Locale,
  {
    title: string;
    issued: string;
    seller: string;
    buyer: string;
    taxId: string;
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    rate: string;
    base: string;
    tax: string;
    subtotal: string;
    shipping: string;
    total: string;
    legal: string;
    void: string;
  }
> = {
  es: {
    title: 'Factura',
    issued: 'Fecha de emisión',
    seller: 'Vendedor',
    buyer: 'Cliente',
    taxId: 'Identificación',
    description: 'Descripción',
    quantity: 'Cant.',
    unitPrice: 'Precio unitario',
    amount: 'Importe',
    rate: 'Tasa',
    base: 'Base',
    tax: 'Impuesto',
    subtotal: 'Subtotal',
    shipping: 'Envío',
    total: 'Total',
    legal: 'Referencia legal',
    void: 'ANULADA',
  },
  en: {
    title: 'Invoice',
    issued: 'Issued',
    seller: 'Seller',
    buyer: 'Customer',
    taxId: 'Tax ID',
    description: 'Description',
    quantity: 'Qty',
    unitPrice: 'Unit price',
    amount: 'Amount',
    rate: 'Rate',
    base: 'Base',
    tax: 'Tax',
    subtotal: 'Subtotal',
    shipping: 'Shipping',
    total: 'Total',
    legal: 'Legal reference',
    void: 'VOID',
  },
};

/**
 * Renders the invoice as one A4 page.
 * @param invoice Stored invoice snapshot.
 * @param options Store values for the header and the footer.
 * @returns A complete HTML document.
 */
export function renderInvoiceHtml(invoice: Invoice, options: InvoiceDocumentOptions): string {
  const L = LABELS[invoice.locale];
  const price = (amountMinor: number) =>
    formatMoney(money(amountMinor, invoice.currency), invoice.locale, options.country);
  const text = (value: string) => escapeHtml(value);
  const number = formatInvoiceNumber(invoice.series, invoice.number);
  const color = escapeHtml(options.primaryColor);
  const buyerAddress = Object.values(invoice.buyer.address).filter(Boolean).map(text).join('<br>');
  // A company buyer is invoiced under its legal name and tax ID; a private buyer has neither, so the contact name stands.
  const buyerTaxId = invoice.buyer.taxId ? `${L.taxId}: ${text(invoice.buyer.taxId)}<br>` : '';
  const lineRows = invoice.lines
    .map(
      (line) =>
        `<tr><td>${text(line.description)}</td><td class="num">${line.quantity}</td>` +
        `<td class="num">${price(line.unitPriceMinor)}</td><td class="num">${price(line.lineTotalMinor)}</td></tr>`,
    )
    .join('');
  const taxRows = invoice.taxBreakdown
    .map(
      (row) =>
        `<tr><td class="num">${(row.rateBp / 100).toFixed(2)}%</td>` +
        `<td class="num">${price(row.baseMinor)}</td><td class="num">${price(row.taxMinor)}</td></tr>`,
    )
    .join('');
  const watermark = invoice.status === 'void' ? `<div class="watermark">${L.void}</div>` : '';
  const legal = invoice.legal?.reference
    ? `<p class="legal">${L.legal}: ${text(invoice.legal.reference)}</p>`
    : '';
  const sellerTaxId = invoice.seller.taxId
    ? `${L.taxId}: ${text(invoice.seller.taxIdType)} ${text(invoice.seller.taxId)}<br>`
    : '';

  return `<!doctype html>
<html lang="${invoice.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${text(number)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font: 12px/1.45 Arial, Helvetica, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 20px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${color}; padding-bottom: 10px; }
  .head-meta { text-align: right; }
  .parties { display: flex; gap: 24px; margin: 18px 0; }
  .parties > div { flex: 1; }
  .label { font-size: 10px; text-transform: uppercase; color: #666; letter-spacing: .04em; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 6px 4px; border-bottom: 1px solid #e5e5e5; text-align: left; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; color: #666; }
  .num { text-align: right; white-space: nowrap; }
  .tax { width: 60%; margin-top: 16px; }
  .totals { width: 42%; margin-left: auto; margin-top: 12px; }
  .totals td { border: 0; padding: 4px; }
  .totals .grand td { font-weight: 700; border-top: 2px solid #111; }
  .watermark { position: fixed; top: 35%; left: 8%; font-size: 120px; font-weight: 700; color: rgba(190, 0, 0, .12); transform: rotate(-25deg); }
  .footer { margin-top: 28px; font-size: 10px; color: #555; white-space: pre-line; }
  .legal { font-size: 10px; color: #555; margin-top: 8px; }
  /* Phones: stack the blocks and use the full width. Screen only, so the printed PDF keeps its A4 layout. */
  @media screen and (max-width: 600px) {
    .head, .parties { flex-direction: column; gap: 12px; }
    .head-meta { text-align: left; }
    .tax, .totals { width: 100%; }
    .watermark { font-size: 64px; }
  }
</style>
</head>
<body>
${watermark}
<header class="head">
  <div><h1>${text(invoice.seller.legalName)}</h1></div>
  <div class="head-meta"><h1>${L.title} ${text(number)}</h1><div>${L.issued}: ${formatDate(invoice.issuedAt, invoice.locale, options.country, options.timeZone)}</div></div>
</header>
<section class="parties">
  <div>
    <div class="label">${L.seller}</div>
    <strong>${text(invoice.seller.legalName)}</strong><br>
    ${sellerTaxId}${text(invoice.seller.address)}<br>
    ${text(invoice.seller.email)} · ${text(invoice.seller.phone)}
  </div>
  <div>
    <div class="label">${L.buyer}</div>
    <strong>${text(invoice.buyer.legalName || invoice.buyer.name)}</strong><br>
    ${buyerTaxId}${buyerAddress}<br>
    ${text(invoice.buyer.email)} · ${text(invoice.buyer.phone)}
  </div>
</section>
<table>
  <thead><tr><th>${L.description}</th><th class="num">${L.quantity}</th><th class="num">${L.unitPrice}</th><th class="num">${L.amount}</th></tr></thead>
  <tbody>${lineRows}</tbody>
</table>
<table class="tax">
  <thead><tr><th class="num">${L.rate}</th><th class="num">${L.base}</th><th class="num">${L.tax}</th></tr></thead>
  <tbody>${taxRows}</tbody>
</table>
<table class="totals">
  <tr><td>${L.subtotal}</td><td class="num">${price(invoice.subtotalMinor)}</td></tr>
  <tr><td>${L.shipping}</td><td class="num">${price(invoice.shippingMinor)}</td></tr>
  <tr><td>${L.tax}</td><td class="num">${price(invoice.taxMinor)}</td></tr>
  <tr class="grand"><td>${L.total}</td><td class="num">${price(invoice.totalMinor)}</td></tr>
</table>
${legal}
<footer class="footer">${text(options.footerNotes)}</footer>
</body>
</html>`;
}
