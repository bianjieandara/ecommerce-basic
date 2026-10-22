// PayPal types and constants: the settings, the API shapes, and the currencies PayPal accepts.
import type { OrderSummary } from '@/application/dto/order-dto';
import type { CurrencyCode } from '@/domain/shared/currency';

/** Settings the adapter reads from its environment. */
export interface PayPalConfig {
  clientId: string | null;
  clientSecret: string | null;
  webhookId: string | null;
  environment: 'sandbox' | 'live';
}

/** Input of initiate(). PayPal needs only the order, the access key and the site URL. */
export interface PayPalInitiateInput {
  order: OrderSummary;
  accessKey: string;
  origin: string;
}

/**
 * Currencies the store can charge through PayPal: the store currencies PayPal accepts as they are. COP, PEN, CLP and ARS are
 * not PayPal currencies, so PayPal is not offered for them.
 */
export const PAYPAL_CURRENCIES: readonly CurrencyCode[] = ['USD', 'EUR', 'MXN'];
/** KV key of the OAuth token. */
export const TOKEN_KEY = 'paypal:token';
/** Seconds before expiry at which the token is refreshed. */
export const TOKEN_MARGIN_SECONDS = 300;

/** The parts of a PayPal order or capture response this adapter reads. */
export interface PayPalOrderResponse {
  id?: string;
  status?: string;
  links?: { rel: string; href: string }[];
  purchase_units?: {
    payments?: {
      captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[];
    };
  }[];
  message?: string;
}

/** A webhook event as PayPal sends it. */
export interface PayPalEvent {
  id: string;
  event_type: string;
  resource: {
    amount?: { value: string; currency_code: string };
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}
