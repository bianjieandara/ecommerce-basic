// Wording printed on the invoice document, per language. It lives here rather than in the UI dictionary because the application
// layer may not import the UI (docs/ARCHITECTURE.md), and a legal document's wording should not change with a UI edit.
import type { Locale } from '@/domain/shared/locale';

/** Fixed wording of the invoice, per language. */
export interface InvoiceLabels {
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

/** Invoice wording for each language the store supports. */
export const INVOICE_LABELS: Record<Locale, InvoiceLabels> = {
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
