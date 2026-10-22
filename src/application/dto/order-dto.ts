// Order shapes shared by ordering use cases, payment gateways and notifications.
import type { CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';
import type { OrderStatus } from '@/domain/ordering/order-status';
import type { PaymentMethod } from '../ports/payments';

/** One line of an order, as a snapshot taken when the order was placed. */
export interface OrderItem {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string | null;
  unitPriceMinor: number;
  unitCostMinor: number | null;
  quantity: number;
  lineTotalMinor: number;
  taxRateBp: number;
  taxMinor: number;
  stockTracked: boolean;
}

/** Customer identity captured at checkout. */
export interface CustomerDetails {
  name: string;
  email: string;
  phone: string;
  whatsappOptIn: boolean;
}

/** Order record as stored. Totals and customer data are snapshots. */
export interface Order {
  id: string;
  number: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  currency: CurrencyCode;
  locale: Locale;
  pricesIncludeTax: boolean;
  subtotalMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  customer: CustomerDetails;
  shippingMethodName: string;
  shippingAddress: Record<string, string>;
  note: string;
  items: OrderItem[];
  expiresAt: string | null;
  paidAt: string | null;
  /** Carrier tracking code, set when the order ships. Empty means none yet. */
  trackingCode: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The short view of an order that payment gateways need. */
export interface OrderSummary {
  id: string;
  number: number;
  currency: CurrencyCode;
  locale: Locale;
  totalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  pricesIncludeTax: boolean;
  customerEmail: string;
  expiresAt: string | null;
  items: { name: string; quantity: number; unitPriceMinor: number; taxRateBp: number }[];
}
