// Manual payment methods: WhatsApp, bank transfer, Deuna! and cash on delivery. Nothing is charged here. The store confirms
// the payment by hand from the admin screens (Stage 16).
import { whatsappLink } from '@/application/documents/whatsapp';
import type { OrderSummary } from '@/application/dto/order-dto';
import type { GatewaySettings, PaymentGateway, PaymentInitiation } from '@/application/ports/payments';
import type { CurrencyCode } from '@/domain/shared/currency';
import { pickText } from '@/domain/shared/localized-text';

/** Input of initiate() for the manual gateways. */
interface ManualInitiateInput {
  order: OrderSummary;
  settings: GatewaySettings;
}

/** WhatsApp: the customer sends the order to the store's number, with the order number in the message. */
export class WhatsAppGateway implements PaymentGateway {
  readonly method = 'whatsapp';

  isConfigured({ contact }: GatewaySettings): boolean {
    return contact.whatsappNumber.replace(/\D/g, '') !== '';
  }

  supportsCurrency(): boolean {
    return true;
  }

  async initiate({ order, settings }: ManualInitiateInput): Promise<PaymentInitiation> {
    const message = `${pickText(settings.contact.whatsappMessage, order.locale, 'es')} #${order.number}`;
    return { kind: 'redirect', url: whatsappLink(settings.contact.whatsappNumber, message) };
  }
}

/** Bank transfer: the customer pays into the store's account. The instructions appear in the email and on the order page. */
export class BankTransferGateway implements PaymentGateway {
  readonly method = 'bank_transfer';

  isConfigured({ checkout }: GatewaySettings): boolean {
    return checkout.bankTransferInstructions.es !== '' || checkout.bankTransferInstructions.en !== '';
  }

  supportsCurrency(): boolean {
    return true;
  }

  async initiate(): Promise<PaymentInitiation> {
    return { kind: 'confirmation' };
  }
}

/**
 * Deuna!: the customer sends the money from the wallet to the number or alias in the instructions, and the store sees it in
 * its own app. Deuna! settles in Ecuador only, so it is offered only to stores that price in dollars.
 */
export class DeunaGateway implements PaymentGateway {
  readonly method = 'deuna';

  isConfigured({ checkout }: GatewaySettings): boolean {
    return checkout.deunaInstructions.es !== '' || checkout.deunaInstructions.en !== '';
  }

  supportsCurrency(currency: CurrencyCode): boolean {
    return currency === 'USD';
  }

  async initiate(): Promise<PaymentInitiation> {
    return { kind: 'confirmation' };
  }
}

/** Cash on delivery: the customer pays the courier when the order arrives. */
export class CashOnDeliveryGateway implements PaymentGateway {
  readonly method = 'cash_on_delivery';

  isConfigured(): boolean {
    return true;
  }

  supportsCurrency(): boolean {
    return true;
  }

  async initiate(): Promise<PaymentInitiation> {
    return { kind: 'confirmation' };
  }
}
