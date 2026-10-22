// WhatsApp alerts to the store team (the alerts number in settings): new orders, low stock and the weekly report.
import type { WhatsAppKey } from '../../ports/whatsapp';
import type { WhatsAppDefinition } from './definition';

type StoreKey = Extract<WhatsAppKey, 'order_alert_store' | 'low_stock_store' | 'weekly_report_store'>;

/** Store alerts, by key. */
export const STORE_WHATSAPP: Record<StoreKey, WhatsAppDefinition> = {
  order_alert_store: {
    key: 'order_alert_store',
    audience: 'store',
    params: ['order.number', 'order.total', 'customer.fullName'],
    buttonPath: 'order.url',
    headerDocument: false,
    body: {
      es: 'Nuevo pedido {{1}} por {{2}} de {{3}}.',
      en: 'New order {{1}} for {{2}} from {{3}}.',
    },
    buttonLabel: { es: 'Ver pedido', en: 'View order' },
  },
  low_stock_store: {
    key: 'low_stock_store',
    audience: 'store',
    params: ['store.name', 'stock.count'],
    buttonPath: null,
    headerDocument: false,
    body: {
      es: 'Alerta de stock en {{1}}: {{2}} variantes están en o bajo su umbral.',
      en: 'Low stock at {{1}}: {{2}} variants are at or below their threshold.',
    },
    buttonLabel: null,
  },
  weekly_report_store: {
    key: 'weekly_report_store',
    audience: 'store',
    params: ['store.name', 'report.period'],
    buttonPath: 'report.url',
    headerDocument: false,
    body: {
      es: 'El informe semanal de {{1}} ({{2}}) está listo.',
      en: 'The weekly report for {{1}} ({{2}}) is ready.',
    },
    buttonLabel: { es: 'Ver informe', en: 'View report' },
  },
};
