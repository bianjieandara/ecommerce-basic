// WhatsApp messages to customers: order updates, the invoice and the back-in-stock alert. Customers only get them after they
// opted in at checkout or on the stock alert form, which the notification service checks before queuing.
import type { WhatsAppKey } from '../../ports/whatsapp';
import type { WhatsAppDefinition } from './definition';

type CustomerKey = Extract<
  WhatsAppKey,
  | 'order_received'
  | 'payment_confirmed'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'invoice_issued'
  | 'back_in_stock'
>;

/** Customer messages, by key. */
export const CUSTOMER_WHATSAPP: Record<CustomerKey, WhatsAppDefinition> = {
  order_received: {
    key: 'order_received',
    audience: 'customer',
    params: ['customer.firstName', 'order.number', 'order.total'],
    buttonPath: null,
    headerDocument: false,
    body: {
      es: 'Hola {{1}}, recibimos tu pedido {{2}} por {{3}}. Te avisaremos cuando esté en camino.',
      en: 'Hi {{1}}, we received your order {{2}} for {{3}}. We will let you know when it is on its way.',
    },
    buttonLabel: null,
  },
  payment_confirmed: {
    key: 'payment_confirmed',
    audience: 'customer',
    params: ['customer.firstName', 'order.number', 'order.total'],
    buttonPath: null,
    headerDocument: false,
    body: {
      es: 'Hola {{1}}, confirmamos el pago de tu pedido {{2}} por {{3}}. Ya lo estamos preparando.',
      en: 'Hi {{1}}, we confirmed the payment for your order {{2}} ({{3}}). We are preparing it now.',
    },
    buttonLabel: null,
  },
  order_shipped: {
    key: 'order_shipped',
    audience: 'customer',
    params: ['customer.firstName', 'order.number', 'order.trackingCode'],
    buttonPath: 'order.url',
    headerDocument: false,
    body: {
      es: 'Hola {{1}}, tu pedido {{2}} ya va en camino. Código de seguimiento: {{3}}.',
      en: 'Hi {{1}}, your order {{2}} is on its way. Tracking code: {{3}}.',
    },
    buttonLabel: { es: 'Ver pedido', en: 'View order' },
  },
  order_delivered: {
    key: 'order_delivered',
    audience: 'customer',
    params: ['customer.firstName', 'order.number'],
    buttonPath: 'order.url',
    headerDocument: false,
    body: {
      es: 'Hola {{1}}, tu pedido {{2}} fue entregado. ¡Gracias por tu compra!',
      en: 'Hi {{1}}, your order {{2}} has been delivered. Thank you for shopping with us!',
    },
    buttonLabel: { es: 'Ver pedido', en: 'View order' },
  },
  order_cancelled: {
    key: 'order_cancelled',
    audience: 'customer',
    params: ['customer.firstName', 'order.number'],
    buttonPath: null,
    headerDocument: false,
    body: {
      es: 'Hola {{1}}, tu pedido {{2}} fue cancelado. Si tienes preguntas, escríbenos.',
      en: 'Hi {{1}}, your order {{2}} has been cancelled. If you have any questions, contact us.',
    },
    buttonLabel: null,
  },
  invoice_issued: {
    key: 'invoice_issued',
    audience: 'customer',
    params: ['customer.firstName', 'invoice.number'],
    buttonPath: null,
    headerDocument: true,
    body: {
      es: 'Hola {{1}}, adjuntamos la factura {{2}} de tu compra.',
      en: 'Hi {{1}}, attached is invoice {{2}} for your purchase.',
    },
    buttonLabel: null,
  },
  back_in_stock: {
    key: 'back_in_stock',
    audience: 'customer',
    params: ['product.name', 'product.variant'],
    buttonPath: 'product.url',
    headerDocument: false,
    body: {
      es: '¡Ya volvió! {{1}} ({{2}}) está otra vez disponible.',
      en: "It's back! {{1}} ({{2}}) is available again.",
    },
    buttonLabel: { es: 'Ver producto', en: 'View product' },
  },
};
