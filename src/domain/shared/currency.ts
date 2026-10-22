// Currencies the store can sell in. `exponent` is the number of minor-unit digits (2 = cents);
// `displayDecimals` is how many decimals the price shows (COP and CLP show whole units).

/** Supported currency codes with their decimal rules. */
export const CURRENCIES = {
  USD: { exponent: 2, displayDecimals: 2 },
  EUR: { exponent: 2, displayDecimals: 2 },
  COP: { exponent: 2, displayDecimals: 0 },
  MXN: { exponent: 2, displayDecimals: 2 },
  PEN: { exponent: 2, displayDecimals: 2 },
  CLP: { exponent: 0, displayDecimals: 0 },
  ARS: { exponent: 2, displayDecimals: 2 },
} as const;

/** An ISO-like currency code the store supports. */
export type CurrencyCode = keyof typeof CURRENCIES;

/**
 * Every supported code as a tuple, for zod enums and option lists. Derived from CURRENCIES so the two can never disagree.
 */
export const CURRENCY_CODES = Object.keys(CURRENCIES) as [CurrencyCode, ...CurrencyCode[]];

/**
 * Checks whether a string is a supported currency code.
 * @param value Candidate code.
 * @returns True for supported codes.
 */
export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}
