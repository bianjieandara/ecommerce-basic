// Wording of the region picker and of the change-service tables, in both guide languages. Prices live in change-plans.ts.
import type { Lang, Region } from './change-plans';

/** Text for one language. Plans, sizes and regions are keyed by the same ids the price data uses. */
interface Copy {
  pickerLabel: string;
  regions: Record<Region, string>;
  single: { head: string[]; sizes: Record<'small' | 'medium' | 'large', string>; credits: (n: number) => string };
  packs: { head: string[]; pack: (n: number) => string; saving: (percent: number) => string };
  plans: {
    head: string[];
    names: Record<'basic' | 'grow' | 'pro', string>;
    response: (days: number) => string;
  };
}

/** Wording per language. */
export const COPY: Record<Lang, Copy> = {
  es: {
    pickerLabel: 'Tu país',
    regions: { intl: 'Otros países (USD)', mx: 'México (MXN)', ec: 'Ecuador (USD)' },
    single: {
      head: ['Tamaño del cambio', 'Créditos', 'Precio'],
      sizes: { small: 'Pequeño', medium: 'Mediano', large: 'Grande' },
      credits: (n) => (n === 1 ? '1 crédito' : `${n} créditos`),
    },
    packs: {
      head: ['Paquete', 'Precio', 'Por crédito', 'Ahorras'],
      pack: (n) => `${n} créditos`,
      saving: (percent) => `${percent} %`,
    },
    plans: {
      head: ['Plan', 'Créditos al mes', 'Respuesta', 'Mensual', 'Anual (2 meses gratis)'],
      names: { basic: 'Básico', grow: 'Crece', pro: 'Pro' },
      response: (days) => (days === 0 ? 'El mismo día hábil' : days === 1 ? '1 día hábil' : `${days} días hábiles`),
    },
  },
  en: {
    pickerLabel: 'Your country',
    regions: { intl: 'Other countries (USD)', mx: 'Mexico (MXN)', ec: 'Ecuador (USD)' },
    single: {
      head: ['Size of the change', 'Credits', 'Price'],
      sizes: { small: 'Small', medium: 'Medium', large: 'Large' },
      credits: (n) => (n === 1 ? '1 credit' : `${n} credits`),
    },
    packs: {
      head: ['Pack', 'Price', 'Per credit', 'You save'],
      pack: (n) => `${n} credits`,
      saving: (percent) => `${percent}%`,
    },
    plans: {
      head: ['Plan', 'Credits per month', 'Response', 'Monthly', 'Yearly (2 months free)'],
      names: { basic: 'Basic', grow: 'Grow', pro: 'Pro' },
      response: (days) => (days === 0 ? 'Same business day' : days === 1 ? '1 business day' : `${days} business days`),
    },
  },
};
