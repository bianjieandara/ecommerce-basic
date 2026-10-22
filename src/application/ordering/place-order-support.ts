// Types and checks that PlaceOrder uses: its dependencies, what it returns, which methods are online, and the cart check.

import { DomainError } from '@/domain/shared/errors';
import type { QuotedLine, QuoteCart } from '../cart/quote-cart';
import type { SettingsRepository } from '../ports/content';
import type { OrderRepository } from '../ports/ordering';
import type { PaymentGateway, PaymentInitiation, PaymentMethod } from '../ports/payments';
import type { BotVerifier, Clock, Hasher, IdGenerator } from '../ports/platform';
import type { EvaluateStockChanges } from '../inventory/evaluate-stock-changes';
import type { NotificationService } from '../notifications/notification-service';

/** Dependencies of PlaceOrder. */
export interface PlaceOrderDeps {
  settings: SettingsRepository;
  quoteCart: (options: { newDays: number }) => QuoteCart;
  orders: OrderRepository;
  gateways: Record<PaymentMethod, PaymentGateway>;
  botVerifier: BotVerifier;
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
  notifications: NotificationService;
  evaluateStock: EvaluateStockChanges;
  siteUrl: string;
}

/** What the browser does after the order is stored. */
export interface PlacedOrder {
  number: number;
  /** The payment step: a provider page, a WhatsApp chat, or a confirmation for the manual methods. */
  next: PaymentInitiation;
  /** Order page with the access key, relative to the site. */
  orderPath: string;
}

/** Methods whose payment window is checkout.onlineHoldMinutes long. The others use manualAutoCancelDays. */
export const ONLINE_METHODS: readonly PaymentMethod[] = ['stripe', 'paypal'];

/**
 * Stops checkout when the cart no longer matches the store: unavailable lines, short stock or changed prices.
 * @param lines Quoted lines.
 * @throws DomainError with the matching code and the affected variant ids.
 */
export function rejectChangedCart(lines: QuotedLine[]): void {
  const pick = (test: (line: QuotedLine) => boolean) => lines.filter(test).map((line) => line.variantId);
  const unavailable = pick((line) => line.flags.unavailable);
  if (unavailable.length > 0) {
    throw new DomainError('PRODUCT_UNAVAILABLE', 'Some products are not available', {
      variantIds: unavailable,
    });
  }
  const short = pick((line) => line.flags.quantityAdjusted);
  if (short.length > 0) throw new DomainError('OUT_OF_STOCK', 'Not enough stock', { variantIds: short });
  const repriced = pick((line) => line.flags.priceChanged);
  if (repriced.length > 0) throw new DomainError('CONFLICT', 'Prices changed', { variantIds: repriced });
}
