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
  /** Where the order came from: UTM values and the like, as the checkout captured them. Absent when nothing was captured. */
  attribution?: Record<string, string>;
  /** Billing details the buyer gave at checkout, for the invoice. Absent when none were given. */
  billing?: Record<string, string>;
  /** Whether the buyer agreed to marketing when ordering. Purchase events are sent to Meta only when this is true. */
  marketingConsent: boolean;
  /** GA4 visitor and session ids, stored only with marketing consent. The GA4 purchase needs the client id. */
  gaClientId: string | null;
  gaSessionId: string | null;
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
