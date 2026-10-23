// Emails sent to the store team: new orders, low stock and the weekly summary.
import type { EmailDefinition } from './definition';

type StoreEmailKey = 'order_alert_store' | 'low_stock_store' | 'weekly_report_store' | 'payment_late_store';

/** Store emails, by key. */
export const STORE_EMAILS: Record<StoreEmailKey, EmailDefinition> = {
  order_alert_store: {
    key: 'order_alert_store',
    audience: 'store',
    label: 'New order (store alert)',
    description: 'Sent to the store when an order is placed.',
    variables: [
      'order.number',
      'order.total',
      'order.paymentMethod',
      'order.note',
      'customer.fullName',
      'customer.email',
      'customer.phone',
    ],
    blocks: ['orderItems', 'orderTotals', 'shippingAddress'],
    defaults: {
      es: {
        subject: 'Nuevo pedido {{order.number}} por {{order.total}}',
        body: `Nuevo pedido **{{order.number}}** de {{customer.fullName}} ({{customer.email}}, {{customer.phone}}).

Forma de pago: {{order.paymentMethod}}

{{block:orderItems}}

{{block:orderTotals}}

{{block:shippingAddress}}

{{#if order.note}}Nota del cliente: {{order.note}}{{/if}}`,
      },
      en: {
        subject: 'New order {{order.number}} for {{order.total}}',
        body: `New order **{{order.number}}** from {{customer.fullName}} ({{customer.email}}, {{customer.phone}}).

Payment method: {{order.paymentMethod}}

{{block:orderItems}}

{{block:orderTotals}}

{{block:shippingAddress}}

{{#if order.note}}Customer note: {{order.note}}{{/if}}`,
      },
    },
  },

  payment_late_store: {
    key: 'payment_late_store',
    audience: 'store',
    label: 'Payment for a cancelled order (store alert)',
    description:
      'Sent to the store when a payment arrives for an order that was already cancelled or expired.',
    variables: [
      'order.number',
      'order.total',
      'order.paymentMethod',
      'customer.fullName',
      'customer.email',
      'customer.phone',
    ],
    blocks: ['orderTotals'],
    defaults: {
      es: {
        subject: 'Pago recibido por un pedido cancelado: {{order.number}}',
        body: `Se recibió un pago de **{{order.total}}** ({{order.paymentMethod}}) por el pedido **{{order.number}}**, que ya estaba cancelado o vencido. El pedido no se reactiva, porque su stock pudo venderse.

Cliente: {{customer.fullName}} ({{customer.email}}, {{customer.phone}}).

{{block:orderTotals}}

**Qué hacer:** reembolsa el pago desde el panel de tu proveedor de pagos y avisa al cliente. Si prefieres atender el pedido, créalo de nuevo a mano.`,
      },
      en: {
        subject: 'Payment received for a cancelled order: {{order.number}}',
        body: `A payment of **{{order.total}}** ({{order.paymentMethod}}) arrived for order **{{order.number}}**, which was already cancelled or expired. The order is not reopened, because its stock may have been sold.

Customer: {{customer.fullName}} ({{customer.email}}, {{customer.phone}}).

{{block:orderTotals}}

**What to do:** refund the payment in your payment provider's dashboard and tell the customer. If you would rather fulfil the order, create it again by hand.`,
      },
    },
  },

  low_stock_store: {
    key: 'low_stock_store',
    audience: 'store',
    label: 'Low stock (store alert)',
    description: 'Sent when variants cross their minimum stock.',
    variables: ['stock.count'],
    blocks: ['lowStockTable'],
    defaults: {
      es: {
        subject: 'Stock bajo en {{stock.count}} variante(s)',
        body: `Estas variantes llegaron a su mínimo de inventario. Repón stock para no perder ventas.

{{block:lowStockTable}}`,
      },
      en: {
        subject: 'Low stock on {{stock.count}} variant(s)',
        body: `These variants reached their minimum stock. Restock them to avoid lost sales.

{{block:lowStockTable}}`,
      },
    },
  },

  weekly_report_store: {
    key: 'weekly_report_store',
    audience: 'store',
    label: 'Weekly summary',
    description: 'Sent every week at the configured day and hour.',
    variables: ['report.period'],
    blocks: ['kpiTable', 'reportButton'],
    defaults: {
      es: {
        subject: 'Resumen semanal de {{store.name}} · {{report.period}}',
        body: `Estos son los indicadores de {{report.period}}.

{{block:kpiTable}}

{{block:reportButton}}`,
      },
      en: {
        subject: 'Weekly summary for {{store.name}} · {{report.period}}',
        body: `These are the key figures for {{report.period}}.

{{block:kpiTable}}

{{block:reportButton}}`,
      },
    },
  },
};
