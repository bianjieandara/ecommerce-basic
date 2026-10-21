// Values that notification templates can use. Producers format money, dates and numbers for the recipient's language
// before they queue a message, so templates only insert text. NotificationService adds the store section.
import type { Locale } from '@/domain/shared/locale';
import type { SettingsRepository } from '../ports/content';

/** One product line of an order or a sales table. */
export interface LineRow {
  name: string;
  variant: string;
  sku: string;
  quantity: number;
  lineTotal: string;
}

/** Amounts under an order, already formatted. */
export interface TotalsRows {
  subtotal: string;
  taxLabel: string;
  tax: string;
  shipping: string;
  total: string;
}

/** One variant in the low-stock alert. */
export interface StockRow {
  name: string;
  variant: string;
  sku: string;
  stock: number;
  threshold: number;
}

/** One indicator in the weekly summary. */
export interface KpiRow {
  label: string;
  value: string;
  delta: string;
}

/** The store's own details, read from settings for every message. */
export interface StoreSection {
  name: string;
  url: string;
  contactEmail: string;
  primaryColor: string;
}

/** Everything a notification can reference. Sections a producer does not provide stay empty. */
export interface NotificationContext {
  /** The recipient's language: selects the copy and the labels. */
  locale: Locale;
  store: StoreSection;
  customer: { firstName: string; fullName: string; email: string; phone: string };
  order: {
    number: string;
    status: string;
    total: string;
    paymentMethod: string;
    url: string;
    trackingCode: string;
    note: string;
    bankInstructions: string;
    items: LineRow[];
    totals: TotalsRows;
    address: string[];
  };
  invoice: { number: string; url: string };
  contact: { name: string; email: string; phone: string; message: string };
  product: { name: string; variant: string; url: string };
  stock: { count: number; items: StockRow[] };
  report: { period: string; url: string; kpis: KpiRow[] };
  admin: { name: string; inviterName: string; resetUrl: string; inviteUrl: string };
}

/** The sections a producer may provide. `locale` and `store` are filled in by NotificationService. */
export type NotificationSections = Partial<Omit<NotificationContext, 'locale' | 'store'>>;

/**
 * Builds a context whose sections are all empty, so every variable an email allows resolves to an empty value.
 * @param locale Recipient language.
 * @param store Store section.
 * @returns A complete context.
 */
export function emptyContext(locale: Locale, store: StoreSection): NotificationContext {
  return {
    locale,
    store,
    customer: { firstName: '', fullName: '', email: '', phone: '' },
    order: {
      number: '',
      status: '',
      total: '',
      paymentMethod: '',
      url: '',
      trackingCode: '',
      note: '',
      bankInstructions: '',
      items: [],
      totals: { subtotal: '', taxLabel: '', tax: '', shipping: '', total: '' },
      address: [],
    },
    invoice: { number: '', url: '' },
    contact: { name: '', email: '', phone: '', message: '' },
    product: { name: '', variant: '', url: '' },
    stock: { count: 0, items: [] },
    report: { period: '', url: '', kpis: [] },
    admin: { name: '', inviterName: '', resetUrl: '', inviteUrl: '' },
  };
}

/**
 * Reads the store section (name, contact email, brand colour) from settings.
 * @param settings Settings repository.
 * @param siteUrl Public site URL (PUBLIC_SITE_URL).
 * @returns The store section.
 */
export async function loadStoreSection(settings: SettingsRepository, siteUrl: string): Promise<StoreSection> {
  const [general, contact, theme] = await Promise.all([
    settings.get('general'),
    settings.get('contact'),
    settings.get('theme'),
  ]);
  return {
    name: general.storeName,
    url: siteUrl,
    contactEmail: contact.email,
    primaryColor: theme.colorPrimary,
  };
}
