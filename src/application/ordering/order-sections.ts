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
import type { PaymentMethod } from '../ports/payments';

/** Payment method names as customers read them. */
const METHOD_NAMES: Record<PaymentMethod, Record<Locale, string>> = {
  stripe: { es: 'Tarjeta (Stripe)', en: 'Card (Stripe)' },
  paypal: { es: 'PayPal', en: 'PayPal' },
  whatsapp: { es: 'Pedido por WhatsApp', en: 'Order via WhatsApp' },
  bank_transfer: { es: 'Transferencia bancaria', en: 'Bank transfer' },
  cash_on_delivery: { es: 'Pago contra entrega', en: 'Cash on delivery' },
};

/** Store values that every order message needs. */
export interface OrderPresentation {
  country: string;
  taxLabel: LocalizedText;
  bankInstructions: LocalizedText;
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
    bankInstructions: checkout.bankTransferInstructions,
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
  /** Access key for the order link. Null when the message should carry no link. */
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
      paymentMethod: METHOD_NAMES[order.paymentMethod][locale],
      url: link,
      trackingCode: '',
      note: order.note,
      bankInstructions:
        order.paymentMethod === 'bank_transfer' ? pickText(presentation.bankInstructions, locale, 'es') : '',
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
