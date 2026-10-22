// Reading amounts that payment providers send. Both card gateways use this, so a malformed figure is refused the same way.
import type { CurrencyCode } from '@/domain/shared/currency';
import { DomainError } from '@/domain/shared/errors';
import { minorOfProviderAmount } from '@/domain/shared/money';

/**
 * Reads an amount a provider sent and refuses anything that is not a valid figure, so a malformed event can never confirm a
 * payment for the wrong amount.
 * @param amount Number or decimal text from the provider.
 * @param currency Currency code.
 * @param provider Provider name, for the error message.
 * @returns Minor units.
 * @throws DomainError PAYMENT_PROVIDER_ERROR for an unreadable amount.
 */
export function providerAmountMinor(
  amount: number | string,
  currency: CurrencyCode,
  provider: string,
): number {
  const minor = minorOfProviderAmount(amount, currency);
  if (minor === null)
    throw new DomainError('PAYMENT_PROVIDER_ERROR', `${provider} sent an unreadable amount`);
  return minor;
}
