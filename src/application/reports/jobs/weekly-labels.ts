// Labels of the weekly summary e-mail. The e-mail is rendered by the application (like the templates in notifications), so its
// few labels live here in the store languages rather than in the admin dictionaries.
import type { Locale } from '@/domain/shared/locale';

/** The labels of the weekly summary's indicators. */
export interface WeeklyLabels {
  revenue: string;
  orders: string;
  averageOrder: string;
  units: string;
  refunds: string;
  topProduct: string;
  lowStock: string;
  outOfStock: string;
  noChange: string;
}

const LABELS: Record<Locale, WeeklyLabels> = {
  es: {
    revenue: 'Ventas',
    orders: 'Pedidos',
    averageOrder: 'Ticket medio',
    units: 'Unidades',
    refunds: 'Reembolsos',
    topProduct: 'Producto más vendido {n}',
    lowStock: 'Stock bajo',
    outOfStock: 'Agotados',
    noChange: '—',
  },
  en: {
    revenue: 'Revenue',
    orders: 'Orders',
    averageOrder: 'Average order',
    units: 'Units',
    refunds: 'Refunds',
    topProduct: 'Top product {n}',
    lowStock: 'Low stock',
    outOfStock: 'Out of stock',
    noChange: '—',
  },
};

/**
 * The weekly summary labels in a language.
 * @param locale Language of the e-mail.
 * @returns The labels.
 */
export function weeklyLabels(locale: Locale): WeeklyLabels {
  return LABELS[locale];
}
