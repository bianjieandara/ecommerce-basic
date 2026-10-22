// Money as integer minor units (cents). Floats are never used for money: they round incorrectly.
import { DomainError } from './errors';
import { CURRENCIES, type CurrencyCode } from './currency';

/** An amount of one currency, stored in minor units. */
export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

/**
 * Creates a Money value after validating it.
 * @param amountMinor Non-negative safe integer in minor units.
 * @param currency Currency of the amount.
 * @returns The Money value.
 * @throws DomainError VALIDATION_FAILED when the amount is not a non-negative integer.
 */
export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new DomainError('VALIDATION_FAILED', `Invalid money amount: ${amountMinor}`);
  }
  return { amountMinor, currency };
}

/**
 * Adds two amounts of the same currency.
 * @param a First amount.
 * @param b Second amount.
 * @returns The sum.
 * @throws DomainError VALIDATION_FAILED when the currencies differ.
 */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new DomainError('VALIDATION_FAILED', 'Currency mismatch');
  return money(a.amountMinor + b.amountMinor, a.currency);
}

/**
 * Multiplies an amount by a whole quantity.
 * @param m Unit amount.
 * @param quantity Whole number of units (at least 0).
 * @returns The total amount.
 */
export function multiplyMoney(m: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new DomainError('VALIDATION_FAILED', `Invalid quantity: ${quantity}`);
  }
  return money(m.amountMinor * quantity, m.currency);
}

/**
 * Reads a price typed in major units ("12.50") into minor units, without floating point arithmetic: an amount with more
 * decimals than the currency has is refused instead of rounded.
 * @param text Typed amount with an optional decimal separator (dot or comma) and no thousands separators.
 * @param exponent Minor-unit digits of the currency (2 for cents, 0 for CLP).
 * @returns Minor units, or null when the text is not a valid amount.
 */
export function minorFromMajorText(text: string, exponent: number): number | null {
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(text.trim());
  if (!match) return null;
  const [, whole = '0', fraction = ''] = match;
  if (/[1-9]/.test(fraction.slice(exponent))) return null;
  const cents = fraction.slice(0, exponent).padEnd(exponent, '0') || '0';
  const minor = Number(whole) * 10 ** exponent + Number(cents);
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Formats minor units as the text an input field shows ("1250" becomes "12.50"); the inverse of minorFromMajorText.
 * @param amountMinor Minor units.
 * @param exponent Minor-unit digits of the currency.
 * @returns The amount with a dot as the decimal separator.
 */
export function majorTextFromMinor(amountMinor: number, exponent: number): string {
  if (exponent === 0) return String(amountMinor);
  const digits = String(amountMinor).padStart(exponent + 1, '0');
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

/**
 * Formats an amount as decimal text in its currency's own precision, the way payment providers take amounts ("1250" in USD
 * becomes "12.50"; in CLP it stays "1250"). Built from the integer digits, so it never rounds.
 * @param amountMinor Minor units.
 * @param currency Currency code.
 * @returns Decimal text with a dot as the separator.
 */
export function majorTextOf(amountMinor: number, currency: CurrencyCode): string {
  return majorTextFromMinor(amountMinor, CURRENCIES[currency].exponent);
}

/**
 * Reads a provider's decimal amount into minor units. Providers send numbers such as 550 or 550.0; this turns the number into
 * text with the currency's digits first, so the conversion stays on decimal text and not on floating-point multiplication.
 * @param amount Amount as a number or as text.
 * @param currency Currency code.
 * @returns Minor units, or null when the amount is not a valid non-negative figure for the currency.
 */
export function minorOfProviderAmount(amount: number | string, currency: CurrencyCode): number | null {
  const exponent = CURRENCIES[currency].exponent;
  const text = typeof amount === 'number' ? amount.toFixed(exponent) : amount;
  return minorFromMajorText(text, exponent);
}
