// Buyer-facing names of the payment methods. The checkout form and the seller card read them here, so a method is
// named with the same words wherever the buyer meets it.
import { PAYMENT_METHODS, type PaymentMethod } from '@/application/ports/payments';
import type { Locale } from '@/domain/shared/locale';
import { t } from '@/ui/i18n';

/**
 * The name one payment method has for the buyer.
 * @param locale Language of the label.
 * @param method Payment method.
 * @returns The translated name.
 */
export function paymentMethodLabel(locale: Locale, method: PaymentMethod): string {
  return t(locale, `checkout.methods.${method}`);
}

/**
 * Every method's name, in the shape the checkout form's labels expect.
 * @param locale Language of the labels.
 * @returns One name per payment method.
 */
export function paymentMethodLabels(locale: Locale): Record<PaymentMethod, string> {
  const labels = {} as Record<PaymentMethod, string>;
  for (const method of PAYMENT_METHODS) labels[method] = paymentMethodLabel(locale, method);
  return labels;
}
