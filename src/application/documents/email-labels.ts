// Fixed wording of the email chrome (table headers and button labels), per language. The message copy itself lives in
// the email definitions under application/notifications/email.
import type { Locale } from '@/domain/shared/locale';

/** Labels used by the email blocks. */
export interface EmailLabels {
  item: string;
  qty: string;
  amount: string;
  subtotal: string;
  shipping: string;
  total: string;
  shipTo: string;
  indicator: string;
  value: string;
  change: string;
  sku: string;
  stock: string;
  minimum: string;
  viewOrder: string;
  downloadInvoice: string;
  resetPassword: string;
  acceptInvite: string;
  viewProduct: string;
  openReports: string;
}

/** Labels for each store language. The type makes both languages carry the same keys. */
export const EMAIL_LABELS: Record<Locale, EmailLabels> = {
  es: {
    item: 'Producto',
    qty: 'Cant.',
    amount: 'Importe',
    subtotal: 'Subtotal',
    shipping: 'Envío',
    total: 'Total',
    shipTo: 'Dirección de envío',
    indicator: 'Indicador',
    value: 'Valor',
    change: 'Cambio',
    sku: 'SKU',
    stock: 'Stock',
    minimum: 'Mínimo',
    viewOrder: 'Ver pedido',
    downloadInvoice: 'Descargar factura',
    resetPassword: 'Restablecer contraseña',
    acceptInvite: 'Aceptar invitación',
    viewProduct: 'Ver producto',
    openReports: 'Abrir reportes',
  },
  en: {
    item: 'Item',
    qty: 'Qty',
    amount: 'Amount',
    subtotal: 'Subtotal',
    shipping: 'Shipping',
    total: 'Total',
    shipTo: 'Shipping address',
    indicator: 'Indicator',
    value: 'Value',
    change: 'Change',
    sku: 'SKU',
    stock: 'Stock',
    minimum: 'Minimum',
    viewOrder: 'View order',
    downloadInvoice: 'Download invoice',
    resetPassword: 'Reset password',
    acceptInvite: 'Accept invitation',
    viewProduct: 'View product',
    openReports: 'Open reports',
  },
};
