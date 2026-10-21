// Which payment methods the customer may pick: enabled in settings, configured, and able to charge the store currency.
import type { CurrencyCode } from '@/domain/shared/currency';
import type { GatewaySettings, PaymentGateway, PaymentMethod } from '../ports/payments';

/**
 * Methods the customer can choose now.
 * @param gateways Gateway per method.
 * @param settings Settings the gateways read.
 * @param currency Store currency.
 * @returns Enabled, configured and supported methods, in the order of the settings.
 */
export function availablePaymentMethods(
  gateways: Record<PaymentMethod, PaymentGateway>,
  settings: GatewaySettings,
  currency: CurrencyCode,
): PaymentMethod[] {
  return settings.checkout.enabledMethods.filter((method) => {
    const gateway = gateways[method];
    return gateway.isConfigured(settings) && gateway.supportsCurrency(currency);
  });
}
