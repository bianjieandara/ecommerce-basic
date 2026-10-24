// Row shapes of the order tables and their mapping to the application's Order. Kept apart from the repository so the queries
// and the mapping can be read on their own.
import type { CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';
import type { OrderStatus } from '@/domain/ordering/order-status';
import type { Order, OrderItem } from '@/application/dto/order-dto';
import type { PaymentMethod } from '@/application/ports/payments';
import { parseJson } from './d1-client';

/** Row shape of orders. */
export interface OrderRow {
  id: string;
  number: number;
  access_key_hash: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_reference: string | null;
  currency: CurrencyCode;
  locale: Locale;
  prices_include_tax: number;
  subtotal_minor: number;
  tax_minor: number;
  shipping_minor: number;
  total_minor: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  whatsapp_opt_in: number;
  shipping_method_name: string;
  shipping_address_json: string;
  customer_note: string;
  expires_at: string | null;
  paid_at: string | null;
  tracking_code: string | null;
  attribution_json: string;
  billing_json: string;
  marketing_consent: number;
  created_at: string;
  updated_at: string;
}

/** Row shape of order_items. */
export interface ItemRow {
  order_id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_label: string;
  sku: string | null;
  unit_price_minor: number;
  unit_cost_minor: number | null;
  quantity: number;
  line_total_minor: number;
  tax_rate_bp: number;
  tax_minor: number;
  stock_tracked: number;
}

/**
 * Maps an item row to the application shape.
 * @param row Database row.
 * @returns Order item.
 */
export function toItem(row: ItemRow): OrderItem {
  return {
    productId: row.product_id,
    variantId: row.variant_id,
    productName: row.product_name,
    variantLabel: row.variant_label,
    sku: row.sku,
    unitPriceMinor: row.unit_price_minor,
    unitCostMinor: row.unit_cost_minor,
    quantity: row.quantity,
    lineTotalMinor: row.line_total_minor,
    taxRateBp: row.tax_rate_bp,
    taxMinor: row.tax_minor,
    stockTracked: row.stock_tracked === 1,
  };
}

/**
 * Maps an order row and its items to the application shape.
 * @param row Database row.
 * @param items Items of the order.
 * @returns Order.
 */
export function toOrder(row: OrderRow, items: OrderItem[]): Order {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    currency: row.currency,
    locale: row.locale,
    pricesIncludeTax: row.prices_include_tax === 1,
    subtotalMinor: row.subtotal_minor,
    taxMinor: row.tax_minor,
    shippingMinor: row.shipping_minor,
    totalMinor: row.total_minor,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
      whatsappOptIn: row.whatsapp_opt_in === 1,
    },
    shippingMethodName: row.shipping_method_name,
    shippingAddress: parseJson<Record<string, string>>(row.shipping_address_json, {}),
    note: row.customer_note,
    items,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    trackingCode: row.tracking_code,
    attribution: parseJson<Record<string, string>>(row.attribution_json, {}),
    billing: parseJson<Record<string, string>>(row.billing_json, {}),
    marketingConsent: row.marketing_consent === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
