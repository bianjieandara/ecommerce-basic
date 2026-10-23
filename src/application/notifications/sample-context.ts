// Sample values for previews and test sends. Every variable an email may use has a realistic value here, so a preview
// shows the real layout and an empty value stands out.
import type { CurrencyCode } from '@/domain/shared/currency';
import { formatMoney } from '@/domain/shared/format';
import type { Locale } from '@/domain/shared/locale';
import { money } from '@/domain/shared/money';
import { ADMIN_PATHS, PATHS, withQuery } from '@/domain/shared/paths';
import { absoluteUrl } from '../documents/urls';
import type { NotificationSections } from './context';

/**
 * Builds sample sections for one language.
 * @param locale Language of the sample text and formatting.
 * @param currency Store currency, used for the sample amounts.
 * @param country Store country, used for number formatting.
 * @param siteUrl Public site URL, used for the sample links.
 * @returns Sample values for every section a template can reference.
 */
export function sampleSections(
  locale: Locale,
  currency: CurrencyCode,
  country: string,
  siteUrl: string,
): NotificationSections {
  const es = locale === 'es';
  const price = (amountMinor: number) => formatMoney(money(amountMinor, currency), locale, country);
  const variant = es ? 'M · Negro' : 'M · Black';
  const orderPath = absoluteUrl(siteUrl, PATHS.order(locale, 1042));
  return {
    customer: {
      firstName: 'Camila',
      fullName: 'Camila Restrepo',
      email: 'camila@example.com',
      phone: '+573001234567',
    },
    order: {
      number: '1042',
      status: es ? 'Pagado' : 'Paid',
      total: price(85000),
      paymentMethod: es ? 'Transferencia bancaria' : 'Bank transfer',
      url: withQuery(orderPath, { key: 'sample' }),
      trackingCode: 'TRK-88421',
      note: es ? 'Dejar en recepción' : 'Leave at reception',
      bankInstructions: es
        ? 'Banco Demo · cuenta corriente 000-123456 · titular Demo Store'
        : 'Demo Bank · checking account 000-123456 · holder Demo Store',
      items: [
        {
          name: es ? 'Camiseta básica' : 'Basic tee',
          variant,
          sku: 'TEE-M-BLK',
          quantity: 2,
          lineTotal: price(50000),
        },
        { name: es ? 'Gorra' : 'Cap', variant: '', sku: 'CAP-01', quantity: 1, lineTotal: price(35000) },
      ],
      totals: {
        subtotal: price(85000),
        taxLabel: es ? 'IVA' : 'VAT',
        tax: price(13571),
        shipping: price(0),
        total: price(85000),
      },
      address: ['Calle 10 # 20-30', 'Medellín, Antioquia', 'Colombia'],
    },
    invoice: {
      number: 'FV-000123',
      url: withQuery(absoluteUrl(siteUrl, PATHS.orderInvoice(locale, 1042)), { key: 'sample' }),
    },
    product: {
      name: es ? 'Camiseta básica' : 'Basic tee',
      variant,
      url: absoluteUrl(siteUrl, PATHS.product(locale, 'basic-tee')),
    },
    stock: {
      count: 2,
      items: [
        { name: es ? 'Camiseta básica' : 'Basic tee', variant, sku: 'TEE-M-BLK', stock: 0, threshold: 3 },
        { name: es ? 'Gorra' : 'Cap', variant: '', sku: 'CAP-01', stock: 2, threshold: 5 },
      ],
    },
    report: {
      period: es ? '12 al 18 de octubre de 2026' : 'Oct 12–18, 2026',
      url: absoluteUrl(siteUrl, ADMIN_PATHS.reports),
      kpis: [
        { label: es ? 'Ventas' : 'Sales', value: price(850000), delta: '+12%' },
        { label: es ? 'Pedidos' : 'Orders', value: '34', delta: '+3' },
        { label: es ? 'Ticket medio' : 'Average order', value: price(25000), delta: '−2%' },
      ],
    },
    admin: {
      name: 'Ana',
      inviterName: 'Luis',
      resetUrl: withQuery(absoluteUrl(siteUrl, ADMIN_PATHS.resetPassword), { token: 'sample' }),
      inviteUrl: withQuery(absoluteUrl(siteUrl, ADMIN_PATHS.acceptInvite), { token: 'sample' }),
    },
  };
}
