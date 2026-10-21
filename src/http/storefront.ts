// Small helpers that turn store settings into the values public pages pass to layouts and components.
import type { CatalogOptions } from '@/domain/catalog/catalog-query';
import { CURRENCIES, type CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';
import { pickText } from '@/domain/shared/localized-text';
import type { StoreContext } from './store-context';
import type { StoreView } from '@/ui/lib/store-view';

/** Contact values the storefront layout and widgets use. */
export interface StorefrontContact {
  email: string;
  address: string;
  whatsappNumber: string;
  whatsappMessage: string;
  showWhatsappFloat: boolean;
}

/**
 * Store-wide values for components (currency, country, tax display).
 * @param store Settings snapshot.
 * @param locale Page language.
 * @returns The view object.
 */
export function storeViewFor(store: StoreContext, locale: Locale): StoreView {
  return {
    locale,
    currency: store.general.currency,
    country: store.general.country,
    pricesIncludeTax: store.tax.pricesIncludeTax,
    storeName: store.general.storeName,
  };
}

/**
 * Parsing options for the catalog (currency decimals and default sort).
 * @param store Settings snapshot.
 * @returns Catalog options.
 */
export function catalogOptionsFor(store: StoreContext): CatalogOptions {
  return {
    exponent: CURRENCIES[store.general.currency as CurrencyCode].exponent,
    defaultSort: store.catalog.defaultSort,
  };
}

/**
 * Contact details in the shape the layout expects, with localized WhatsApp text resolved.
 * @param store Settings snapshot.
 * @param locale Page language.
 * @returns Contact values.
 */
export function contactFor(store: StoreContext, locale: Locale): StorefrontContact {
  return {
    email: store.contact.email,
    address: store.contact.address,
    whatsappNumber: store.contact.whatsappNumber,
    whatsappMessage: pickText(store.contact.whatsappMessage, locale, 'es'),
    showWhatsappFloat: store.contact.showWhatsappFloat,
  };
}

/**
 * Page title from the SEO title template ("%s | Store"), or the store name alone on the home page.
 * @param store Settings snapshot.
 * @param locale Page language.
 * @param pageTitle Title of the page; empty for the home page.
 * @returns Full document title.
 */
export function buildTitle(store: StoreContext, locale: Locale, pageTitle: string): string {
  if (!pageTitle) return store.general.storeName;
  return pickText(store.seo.titleTemplate, locale, 'es').replace('%s', pageTitle);
}
