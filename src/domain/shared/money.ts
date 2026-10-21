// Money as integer minor units (cents). Floats are never used for money: they round incorrectly.
import { DomainError } from './errors';
import type { CurrencyCode } from './currency';

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
