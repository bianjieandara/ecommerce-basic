// Order part of a notification: formatted amounts, items, address and links. Formatting happens here, so the email
// templates only insert text.
import type { CurrencyCode } from '@/domain/shared/currency';
import { formatMoney } from '@/domain/shared/format';
import type { Locale } from '@/domain/shared/locale';
import { money } from '@/domain/shared/money';
import { pickText, type LocalizedText } from '@/domain/shared/localized-text';
import { PATHS, withQuery } from '@/domain/shared/paths';
import { absoluteUrl } from '../documents/urls';
import type { Order } from '../dto/order-dto';
import type { CheckoutSettings, GeneralSettings, TaxSettings } from '../dto/settings-dto';
import type { NotificationSections } from '../notifications/context';
import type { SettingsRepository } from '../ports/content';
import {
  INSTRUCTED_METHODS,
  PAYMENT_METHODS,
  type InstructedMethod,
  type PaymentMethod,
} from '../ports/payments';

/** Payment method names as customers read them. */
const METHOD_NAMES: Record<PaymentMethod, Record<Locale, string>> = {
  dlocalgo: { es: 'Tarjeta (dLocal Go)', en: 'Card (dLocal Go)' },
  paypal: { es: 'PayPal', en: 'PayPal' },
  whatsapp: { es: 'Pedido por WhatsApp', en: 'Order via WhatsApp' },
  bank_transfer: { es: 'Transferencia bancaria', en: 'Bank transfer' },
  cash_on_delivery: { es: 'Pago contra entrega', en: 'Cash on delivery' },
  deuna: { es: 'Deuna!', en: 'Deuna!' },
};

/** The settings text that tells the buyer where to send the money, per method. A new manual method adds one line here. */
const INSTRUCTIONS_OF: Record<InstructedMethod, (checkout: CheckoutSettings) => LocalizedText> = {
  bank_transfer: (checkout) => checkout.bankTransferInstructions,
  deuna: (checkout) => checkout.deunaInstructions,
};

/**
 * Whether a stored method is one the buyer pays by hand against instructions.
 * @param method Method as stored on the order.
 * @returns True for the methods that show instructions.
 */
export function isInstructedMethod(method: string): method is InstructedMethod {
  return (INSTRUCTED_METHODS as readonly string[]).includes(method);
}

/**
 * Where the buyer sends the money for this method, or null when the method charges by itself.
 * @param checkout Checkout settings.
 * @param method Method as stored on the order.
 * @returns The instructions, or null.
 */
export function paymentInstructions(checkout: CheckoutSettings, method: string): LocalizedText | null {
  return isInstructedMethod(method) ? INSTRUCTIONS_OF[method](checkout) : null;
}

/** Whether a stored value is a payment method this version knows. */
function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

/**
 * The name of a payment method for a customer message. A method stored before the gateway change has no name, so its stored value is
 * used: the message still goes out, and the customer sees how the order was recorded.
 * @param method Method as stored.
 * @param locale Language of the message.
 * @returns The name.
 */
function methodName(method: string, locale: Locale): string {
  return isPaymentMethod(method) ? METHOD_NAMES[method][locale] : method;
}

/** Store values that every order message needs. */
export interface OrderPresentation {
  country: string;
  taxLabel: LocalizedText;
  /** Where to send the money, per method the buyer pays by hand. */
  instructions: Record<InstructedMethod, LocalizedText>;
}

/**
 * Picks the store values order messages need from settings already loaded.
 * @param general General settings.
 * @param tax Tax settings.
 * @param checkout Checkout settings.
 * @returns The presentation values.
 */
export function orderPresentation(
  general: GeneralSettings,
  tax: TaxSettings,
  checkout: CheckoutSettings,
): OrderPresentation {
  return {
    country: general.country,
    taxLabel: tax.label,
    instructions: Object.fromEntries(
      INSTRUCTED_METHODS.map((method) => [method, INSTRUCTIONS_OF[method](checkout)]),
    ) as Record<InstructedMethod, LocalizedText>,
  };
}

/**
 * Loads the order presentation from settings.
 * @param settings Settings repository.
 * @returns The presentation values.
 */
export async function loadOrderPresentation(settings: SettingsRepository): Promise<OrderPresentation> {
  const [general, tax, checkout] = await Promise.all([
    settings.get('general'),
    settings.get('tax'),
    settings.get('checkout'),
  ]);
  return orderPresentation(general, tax, checkout);
}

/** Options for one order message. */
export interface OrderSectionsOptions {
  siteUrl: string;
  presentation: OrderPresentation;
  /** Key for the order link: the checkout key, or the email key from OrderLinks. Null leaves the link out. */
  accessKey: string | null;
}

/**
 * Notification sections for one order, written in one language.
 * @param order Order snapshot.
 * @param locale Language of the message.
 * @param options Links and store values.
 * @returns Sections for NotificationService.notify.
 */
export function orderSections(
  order: Order,
  locale: Locale,
  options: OrderSectionsOptions,
): NotificationSections {
  const { presentation } = options;
  const price = (amountMinor: number) =>
    formatMoney(money(amountMinor, order.currency as CurrencyCode), locale, presentation.country);
  const link = options.accessKey
    ? withQuery(absoluteUrl(options.siteUrl, PATHS.order(locale, order.number)), { key: options.accessKey })
    : '';
  const address = order.shippingAddress;
  const addressLines = [
    address.line1,
    address.line2,
    [address.postalCode, address.city].filter(Boolean).join(' '),
    address.region,
    address.country,
  ].filter((line): line is string => Boolean(line));

  return {
    customer: {
      firstName: order.customer.name.split(' ')[0] ?? order.customer.name,
      fullName: order.customer.name,
      email: order.customer.email,
      phone: order.customer.phone,
    },
    order: {
      number: String(order.number),
      status: order.status,
      total: price(order.totalMinor),
      paymentMethod: methodName(order.paymentMethod, locale),
      url: link,
      trackingCode: order.trackingCode ?? '',
      note: order.note,
      // The name is kept because stored email templates write {{block:bankInstructions}}; it now carries the instructions of
      // whichever method the buyer pays by hand.
      bankInstructions: isInstructedMethod(order.paymentMethod)
        ? pickText(presentation.instructions[order.paymentMethod], locale, 'es')
        : '',
      items: order.items.map((item) => ({
        name: item.productName,
        variant: item.variantLabel,
        sku: item.sku ?? '',
        quantity: item.quantity,
        lineTotal: price(item.lineTotalMinor),
      })),
      totals: {
        subtotal: price(order.subtotalMinor),
        taxLabel: pickText(presentation.taxLabel, locale, 'es'),
        tax: price(order.taxMinor),
        shipping: price(order.shippingMinor),
        total: price(order.totalMinor),
      },
      address: addressLines,
    },
  };
}
