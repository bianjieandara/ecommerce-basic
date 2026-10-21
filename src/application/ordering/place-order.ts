// PlaceOrder: checks the cart on the server, stores the order, starts the chosen payment and queues the emails.
// The order is stored before the provider is called, so a payment never refers to an order that does not exist.
import { DomainError } from '@/domain/shared/errors';
import { PATHS, withQuery } from '@/domain/shared/paths';
import type { QuotedLine, QuoteCart } from '../cart/quote-cart';
import type { Order, OrderSummary } from '../dto/order-dto';
import type { SettingsRepository } from '../ports/content';
import type { NewOrder, OrderRepository } from '../ports/ordering';
import type { PaymentGateway, PaymentInitiation, PaymentMethod } from '../ports/payments';
import type { BotVerifier, Clock, Hasher, IdGenerator } from '../ports/platform';
import type { NotificationService } from '../notifications/notification-service';
import { newAccessKey } from './access-key';
import { orderPresentation, orderSections } from './order-sections';
import { availablePaymentMethods } from './payment-methods';
import type { PlaceOrderInput } from './schemas';

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
const ONLINE_METHODS: readonly PaymentMethod[] = ['stripe', 'paypal'];

/**
 * Stops checkout when the cart no longer matches the store: unavailable lines, short stock or changed prices.
 * @param lines Quoted lines.
 * @throws DomainError with the matching code and the affected variant ids.
 */
function rejectChangedCart(lines: QuotedLine[]): void {
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

/** Places orders from checkout requests. */
export class PlaceOrder {
  /** @param deps Repositories, gateways and services. */
  constructor(private readonly deps: PlaceOrderDeps) {}

  /**
   * Places an order.
   * @param input Parsed checkout request.
   * @param client Client IP, used by the bot check.
   * @returns The order number, the payment step and the order page.
   * @throws DomainError with the code of the first problem found.
   */
  async execute(input: PlaceOrderInput, client: { ip: string | null }): Promise<PlacedOrder> {
    if (!(await this.deps.botVerifier.verify(input.turnstileToken, client.ip))) {
      throw new DomainError('BOT_CHECK_FAILED', 'The security check failed');
    }
    const [general, tax, checkout, contact, catalog] = await Promise.all([
      this.deps.settings.get('general'),
      this.deps.settings.get('tax'),
      this.deps.settings.get('checkout'),
      this.deps.settings.get('contact'),
      this.deps.settings.get('catalog'),
    ]);
    const gatewaySettings = { checkout, contact };
    const paymentMethods = availablePaymentMethods(this.deps.gateways, gatewaySettings, general.currency);
    if (!paymentMethods.includes(input.paymentMethod)) {
      throw new DomainError('PAYMENT_METHOD_UNAVAILABLE', 'This payment method is not available');
    }

    const quote = await this.deps
      .quoteCart({ newDays: catalog.newDays })
      .execute(
        { locale: input.locale, items: input.items, shippingMethodId: input.shippingMethodId },
        { tax, paymentMethods },
      );
    rejectChangedCart(quote.lines);
    const shipping = quote.shippingOptions.find((option) => option.id === input.shippingMethodId);
    if (!shipping) {
      throw new DomainError('VALIDATION_FAILED', 'Choose a shipping method', [
        { path: ['shippingMethodId'], message: 'Unknown shipping method' },
      ]);
    }
    if (shipping.kind === 'flat' && input.address === null) {
      throw new DomainError('VALIDATION_FAILED', 'A shipping address is required', [
        { path: ['address'], message: 'Required for delivery' },
      ]);
    }

    const { totals } = quote;
    const lines = quote.lines.filter((line) => line.available);
    const now = this.deps.clock.now();
    const nowIso = now.toISOString();
    const holdMinutes = ONLINE_METHODS.includes(input.paymentMethod)
      ? checkout.onlineHoldMinutes
      : checkout.manualAutoCancelDays * 24 * 60;
    const expiresAt = holdMinutes > 0 ? new Date(now.getTime() + holdMinutes * 60_000).toISOString() : null;

    const id = this.deps.ids.newId();
    const accessKey = newAccessKey(this.deps.ids);
    const customer = {
      name: input.customer.name,
      email: input.customer.email,
      phone: input.customer.phone,
      whatsappOptIn: input.whatsappOptIn,
    };
    const address = input.address ?? {};
    const items = lines.map((line, index) => ({
      productId: line.productId,
      variantId: line.variantId,
      productName: line.name,
      variantLabel: line.variantLabel,
      sku: line.sku,
      unitPriceMinor: line.unitPriceMinor,
      unitCostMinor: line.costMinor,
      quantity: line.quantity,
      lineTotalMinor: line.lineTotalMinor,
      taxRateBp: line.taxRateBp,
      taxMinor: totals.lines[index]?.taxMinor ?? 0,
      stockTracked: line.stockTracked,
    }));
    const draft: NewOrder = {
      id,
      accessKeyHash: await this.deps.hasher.sha256Hex(accessKey),
      paymentMethod: input.paymentMethod,
      currency: general.currency,
      locale: input.locale,
      pricesIncludeTax: tax.pricesIncludeTax,
      subtotalMinor: totals.subtotalMinor,
      taxMinor: totals.taxMinor,
      shippingMinor: totals.shippingMinor,
      totalMinor: totals.totalMinor,
      customer,
      shippingMethodId: shipping.id,
      shippingMethodName: shipping.name,
      shippingAddress: address,
      note: input.note,
      attribution: input.attribution,
      expiresAt,
      createdAt: nowIso,
      items,
    };
    const placed = await this.deps.orders.place(draft);

    const summary: OrderSummary = {
      id,
      number: placed.number,
      currency: general.currency,
      locale: input.locale,
      totalMinor: totals.totalMinor,
      shippingMinor: totals.shippingMinor,
      taxMinor: totals.taxMinor,
      pricesIncludeTax: tax.pricesIncludeTax,
      customerEmail: input.customer.email,
      expiresAt,
      items: lines.map((line) => ({
        name: line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        taxRateBp: line.taxRateBp,
      })),
    };
    let initiation: PaymentInitiation;
    try {
      initiation = await this.deps.gateways[input.paymentMethod].initiate({
        order: summary,
        accessKey,
        origin: this.deps.siteUrl,
        settings: gatewaySettings,
      });
    } catch (error) {
      // The provider never took the order, so the stock goes back at once.
      await this.deps.orders.cancelAndReleaseStock(id, 'pending_payment', {
        type: 'payment_start_failed',
        actor: 'system',
        at: this.deps.clock.now().toISOString(),
      });
      throw error instanceof DomainError
        ? error
        : new DomainError('PAYMENT_PROVIDER_ERROR', 'The payment could not be started');
    }
    if (initiation.kind === 'redirect' && initiation.providerReference) {
      await this.deps.orders.setPaymentReference(id, initiation.providerReference, nowIso);
    }

    const order: Order = {
      id,
      number: placed.number,
      status: 'pending_payment',
      paymentMethod: input.paymentMethod,
      paymentReference: initiation.kind === 'redirect' ? (initiation.providerReference ?? null) : null,
      currency: general.currency,
      locale: input.locale,
      pricesIncludeTax: tax.pricesIncludeTax,
      subtotalMinor: totals.subtotalMinor,
      taxMinor: totals.taxMinor,
      shippingMinor: totals.shippingMinor,
      totalMinor: totals.totalMinor,
      customer,
      shippingMethodName: shipping.name,
      shippingAddress: address,
      note: input.note,
      items: items,
      expiresAt,
      paidAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const presentation = orderPresentation(general, tax, checkout);
    await this.deps.notifications.notify({
      key: 'order_received',
      reference: id,
      orderId: id,
      recipient: { email: input.customer.email, locale: input.locale },
      context: orderSections(order, input.locale, { siteUrl: this.deps.siteUrl, presentation, accessKey }),
    });
    await this.deps.notifications.notify({
      key: 'order_alert_store',
      reference: id,
      orderId: id,
      recipient: { email: checkout.orderNotificationEmail || contact.email, locale: general.defaultLocale },
      context: orderSections(order, general.defaultLocale, {
        siteUrl: this.deps.siteUrl,
        presentation,
        accessKey: null,
      }),
    });

    return {
      number: placed.number,
      next: initiation,
      orderPath: withQuery(PATHS.order(input.locale, placed.number), { key: accessKey }),
    };
  }
}
