// Other emails sent to customers: invoices, contact replies and back-in-stock alerts. Order lifecycle emails are in order-emails.ts.
import type { EmailDefinition } from './definition';

type CustomerEmailKey = 'invoice_issued' | 'contact_autoreply' | 'back_in_stock';

/** Customer emails that are not about an order's lifecycle, by key. */
export const CUSTOMER_EMAILS: Record<CustomerEmailKey, EmailDefinition> = {
  invoice_issued: {
    key: 'invoice_issued',
    audience: 'customer',
    label: 'Invoice issued',
    description: 'Sent when the invoice for a paid order is issued.',
    variables: ['customer.firstName', 'order.number', 'invoice.number'],
    blocks: [],
    defaults: {
      es: {
        subject: 'Tu factura {{invoice.number}} del pedido {{order.number}}',
        body: `Hola {{customer.firstName}}, tu factura **{{invoice.number}}** del pedido **{{order.number}}** ya está lista y va adjunta en PDF.`,
      },
      en: {
        subject: 'Your invoice {{invoice.number}} for order {{order.number}}',
        body: `Hi {{customer.firstName}}, your invoice **{{invoice.number}}** for order **{{order.number}}** is ready and is attached to this email as a PDF.`,
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
