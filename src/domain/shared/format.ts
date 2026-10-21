// Locale-aware formatting built on the standard Intl API. Used by the UI, emails, invoices and CSV exports,
// so every output of a price, date or percentage comes from this one module.
import { CURRENCIES } from './currency';
import type { Locale } from './locale';
import type { Money } from './money';

/**
 * Builds the Intl locale tag for a store, for example "es-CO" or "en-CO".
 * @param locale Language code.
 * @param country Two-letter country code from store settings.
 * @returns Intl locale tag.
 */
export function intlLocale(locale: Locale, country: string): string {
  return `${locale}-${country.toUpperCase()}`;
}

/**
 * Formats a money amount with the currency symbol and the currency's display decimals.
 * @param value Amount in minor units with its currency.
 * @param locale Language code.
 * @param country Store country code.
 * @returns Localized price text, for example "$ 12.50" or "$ 45.000" for COP.
 */
export function formatMoney(value: Money, locale: Locale, country: string): string {
  const spec = CURRENCIES[value.currency];
  const major = value.amountMinor / 10 ** spec.exponent;
  return new Intl.NumberFormat(intlLocale(locale, country), {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: spec.displayDecimals,
    maximumFractionDigits: spec.displayDecimals,
  }).format(major);
}

/**
 * Formats an ISO timestamp as a date and time in the store's timezone.
 * @param iso ISO 8601 UTC timestamp.
 * @param locale Language code.
 * @param country Store country code.
 * @param timeZone IANA timezone, for example "America/Bogota".
 * @returns Localized date and time.
 */
export function formatDateTime(iso: string, locale: Locale, country: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale, country), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

/**
 * Formats an ISO timestamp as a date only, in the store's timezone.
 * @param iso ISO 8601 UTC timestamp.
 * @param locale Language code.
 * @param country Store country code.
 * @param timeZone IANA timezone.
 * @returns Localized date.
 */
export function formatDate(iso: string, locale: Locale, country: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale, country), { dateStyle: 'medium', timeZone }).format(
    new Date(iso),
  );
}

/**
 * Formats a basis-point rate as a percentage.
 * @param rateBp Rate in basis points (1900 = 19%).
 * @param locale Language code.
 * @param country Store country code.
 * @returns Localized percentage, for example "19%".
 */
export function formatPercent(rateBp: number, locale: Locale, country: string): string {
  return new Intl.NumberFormat(intlLocale(locale, country), {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(rateBp / 10_000);
}

/**
 * Formats an integer or decimal number for display.
 * @param value Number to format.
 * @param locale Language code.
 * @param country Store country code.
 * @returns Localized number text.
 */
export function formatNumber(value: number, locale: Locale, country: string): string {
  return new Intl.NumberFormat(intlLocale(locale, country)).format(value);
}
