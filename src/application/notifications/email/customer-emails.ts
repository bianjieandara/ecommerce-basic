// Emails sent to customers: order updates, invoices, contact replies and back-in-stock alerts.
import type { EmailDefinition } from './definition';

type CustomerEmailKey =
  | 'order_received'
  | 'payment_confirmed'
  | 'order_processing'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'order_refunded'
  | 'invoice_issued'
  | 'contact_autoreply'
  | 'back_in_stock';

/** Customer emails, by key. */
export const CUSTOMER_EMAILS: Record<CustomerEmailKey, EmailDefinition> = {
  order_received: {
    key: 'order_received',
    audience: 'customer',
    label: 'Order received',
    description: 'Sent right after checkout, whatever the payment method.',
    variables: ['customer.firstName', 'order.number', 'order.total', 'order.paymentMethod'],
    blocks: ['orderItems', 'orderTotals', 'bankInstructions', 'orderButton'],
    defaults: {
      es: {
        subject: 'Recibimos tu pedido {{order.number}}',
        body: `Hola {{customer.firstName}}, gracias por tu compra.

Recibimos tu pedido **{{order.number}}** por un total de **{{order.total}}**. Forma de pago: {{order.paymentMethod}}.

{{block:orderItems}}

{{block:orderTotals}}

{{block:bankInstructions}}

{{block:orderButton}}`,
      },
      en: {
        subject: 'We received your order {{order.number}}',
        body: `Hi {{customer.firstName}}, thank you for your purchase.

We received your order **{{order.number}}** for a total of **{{order.total}}**. Payment method: {{order.paymentMethod}}.

{{block:orderItems}}

{{block:orderTotals}}

{{block:bankInstructions}}

{{block:orderButton}}`,
      },
    },
  },

  payment_confirmed: {
    key: 'payment_confirmed',
    audience: 'customer',
    label: 'Payment confirmed',
    description: 'Sent when a payment is confirmed (online providers and bank transfers).',
    variables: ['customer.firstName', 'order.number'],
    blocks: ['orderButton'],
    defaults: {
      es: {
        subject: 'Pago confirmado del pedido {{order.number}}',
        body: `Hola {{customer.firstName}}, confirmamos el pago de tu pedido **{{order.number}}**. Ya estamos preparándolo.

{{block:orderButton}}`,
      },
      en: {
        subject: 'Payment confirmed for order {{order.number}}',
        body: `Hi {{customer.firstName}}, we confirmed the payment for your order **{{order.number}}**. We are preparing it now.

{{block:orderButton}}`,
      },
    },
  },

  order_processing: {
    key: 'order_processing',
    audience: 'customer',
    label: 'Order being prepared',
    description: 'Sent when the store starts preparing the order.',
    variables: ['customer.firstName', 'order.number'],
    blocks: ['orderButton'],
    defaults: {
      es: {
        subject: 'Estamos preparando tu pedido {{order.number}}',
        body: `Hola {{customer.firstName}}, tu pedido **{{order.number}}** está en preparación. Te avisaremos cuando salga.

{{block:orderButton}}`,
      },
      en: {
        subject: 'Your order {{order.number}} is being prepared',
        body: `Hi {{customer.firstName}}, your order **{{order.number}}** is being prepared. We will let you know when it ships.

{{block:orderButton}}`,
      },
    },
  },

  order_shipped: {
    key: 'order_shipped',
    audience: 'customer',
    label: 'Order shipped',
    description: 'Sent when the order leaves the store. Shows the tracking code when there is one.',
    variables: ['customer.firstName', 'order.number', 'order.trackingCode'],
    blocks: ['orderButton'],
    defaults: {
      es: {
        subject: 'Tu pedido {{order.number}} va en camino',
        body: `Hola {{customer.firstName}}, tu pedido **{{order.number}}** ya fue enviado.

{{#if order.trackingCode}}Código de seguimiento: **{{order.trackingCode}}**{{else}}Te enviaremos el código de seguimiento en cuanto esté disponible.{{/if}}

{{block:orderButton}}`,
      },
      en: {
        subject: 'Your order {{order.number}} is on its way',
        body: `Hi {{customer.firstName}}, your order **{{order.number}}** has shipped.

{{#if order.trackingCode}}Tracking code: **{{order.trackingCode}}**{{else}}We will send you the tracking code as soon as it is available.{{/if}}

{{block:orderButton}}`,
      },
    },
  },

  order_delivered: {
    key: 'order_delivered',
    audience: 'customer',
    label: 'Order delivered',
    description: 'Sent when the carrier confirms delivery.',
    variables: ['customer.firstName', 'order.number'],
    blocks: ['orderButton'],
    defaults: {
      es: {
        subject: 'Tu pedido {{order.number}} fue entregado',
        body: `Hola {{customer.firstName}}, confirmamos la entrega de tu pedido **{{order.number}}**. ¡Gracias por comprar con nosotros!

{{block:orderButton}}`,
      },
      en: {
        subject: 'Your order {{order.number}} was delivered',
        body: `Hi {{customer.firstName}}, we confirmed the delivery of your order **{{order.number}}**. Thank you for shopping with us!

{{block:orderButton}}`,
      },
    },
  },

  order_cancelled: {
    key: 'order_cancelled',
    audience: 'customer',
    label: 'Order cancelled',
    description: 'Sent when an order is cancelled, including payments that expired.',
    variables: ['customer.firstName', 'order.number'],
    blocks: [],
    defaults: {
      es: {
        subject: 'Tu pedido {{order.number}} fue cancelado',
        body: 'Hola {{customer.firstName}}, tu pedido **{{order.number}}** fue cancelado. Si ya pagaste, te contactaremos para el reembolso. Si tienes preguntas, responde a este correo.',
      },
      en: {
        subject: 'Your order {{order.number}} was cancelled',
        body: 'Hi {{customer.firstName}}, your order **{{order.number}}** was cancelled. If you already paid, we will contact you about the refund. Reply to this email if you have questions.',
      },
    },
  },

  order_refunded: {
    key: 'order_refunded',
    audience: 'customer',
    label: 'Order refunded',
    description: 'Sent when a refund is issued.',
    variables: ['customer.firstName', 'order.number', 'order.total'],
    blocks: [],
    defaults: {
      es: {
        subject: 'Reembolso de tu pedido {{order.number}}',
        body: 'Hola {{customer.firstName}}, procesamos un reembolso de **{{order.total}}** por tu pedido **{{order.number}}**. Tu banco o tu medio de pago puede tardar unos días en reflejarlo.',
      },
      en: {
        subject: 'Refund for your order {{order.number}}',
        body: 'Hi {{customer.firstName}}, we processed a refund of **{{order.total}}** for your order **{{order.number}}**. Your bank or payment provider may take a few days to show it.',
      },
    },
  },

  invoice_issued: {
    key: 'invoice_issued',
    audience: 'customer',
    label: 'Invoice issued',
    description: 'Sent when the invoice for a paid order is issued.',
    variables: ['customer.firstName', 'order.number', 'invoice.number'],
    blocks: ['invoiceButton'],
    defaults: {
      es: {
        subject: 'Tu factura {{invoice.number}} del pedido {{order.number}}',
        body: `Hola {{customer.firstName}}, tu factura **{{invoice.number}}** del pedido **{{order.number}}** ya está lista. Puedes descargarla con el botón.

{{block:invoiceButton}}`,
      },
      en: {
        subject: 'Your invoice {{invoice.number}} for order {{order.number}}',
        body: `Hi {{customer.firstName}}, your invoice **{{invoice.number}}** for order **{{order.number}}** is ready. You can download it with the button below.

{{block:invoiceButton}}`,
      },
    },
  },

  contact_autoreply: {
    key: 'contact_autoreply',
    audience: 'customer',
    label: 'Contact auto-reply',
    description: 'Sent to the person who used the contact form.',
    variables: ['customer.firstName'],
    blocks: [],
    defaults: {
      es: {
        subject: 'Recibimos tu mensaje',
        body: 'Hola {{customer.firstName}}, gracias por escribirnos. Te responderemos lo antes posible.',
      },
      en: {
        subject: 'We received your message',
        body: 'Hi {{customer.firstName}}, thank you for writing to us. We will reply as soon as possible.',
      },
    },
  },

  back_in_stock: {
    key: 'back_in_stock',
    audience: 'customer',
    label: 'Back in stock',
    description: 'Sent once to each person who asked to be told when a variant returns.',
    variables: ['product.name', 'product.variant'],
    blocks: ['productButton'],
    defaults: {
      es: {
        subject: '{{product.name}} volvió a estar disponible',
        body: `Buenas noticias: **{{product.name}}**{{#if product.variant}} ({{product.variant}}){{/if}} ya está disponible otra vez.

{{block:productButton}}`,
      },
      en: {
        subject: '{{product.name}} is back in stock',
        body: `Good news: **{{product.name}}**{{#if product.variant}} ({{product.variant}}){{/if}} is back in stock.

{{block:productButton}}`,
      },
    },
  },
};
