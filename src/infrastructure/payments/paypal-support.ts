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

/** The parts of a PayPal refund response this adapter reads. */
export interface PayPalRefundResponse {
  id?: string;
  status?: string;
  amount?: { value: string; currency_code: string };
  name?: string;
  message?: string;
  details?: { issue?: string; description?: string }[];
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

/**
 * True for the certificate address of a PayPal webhook: https, on a paypal.com host. PayPal fetches that address itself to
 * verify the signature, so one that points anywhere else is not a real delivery.
 * @param value Value of the PAYPAL-CERT-URL header.
 * @returns Whether the address is on a PayPal host.
 */
export function isPayPalCertUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && (url.hostname === 'paypal.com' || url.hostname.endsWith('.paypal.com'))
    );
  } catch {
    return false;
  }
}
