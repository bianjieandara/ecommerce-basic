// Who the buyer is paying: the seller's published identity, the address and phone, the payment methods the store can
// actually charge and its Google rating. One loader for every page that shows the seller card, so the product page and
// the checkout never disagree about what the store accepts.
import { availablePaymentMethods } from '@/application/ordering/payment-methods';
import type { SettingsMap } from '@/application/content/settings-schemas';
import type { PaymentMethod } from '@/application/ports/payments';
import type { Container } from '@/composition/create-container';
import type { Locale } from '@/domain/shared/locale';
import type { StoreContext } from './store-context';

/** The seller as the buyer sees it. Empty fields are left out by the component that renders them. */
export interface SellerTrust {
  legalName: string;
  /** How the identification is named where the store trades: RUC, NIT, RFC. Empty shows the number alone. */
  taxIdType: string;
  taxId: string;
  address: string;
  phone: string;
  /** Methods the buyer will really be offered at checkout, so the card never promises one that is not configured. */
  methods: PaymentMethod[];
  /** Google rating, or null when the store hides reviews or nothing is cached yet. */
  reviews: { rating: number; count: number; mapsUri: string } | null;
}

/** The seller card and the invoicing group it was built from, so a page that needs the group does not read it twice. */
export interface LoadedSellerTrust {
  seller: SellerTrust;
  invoicing: SettingsMap['invoicing'];
}

/**
 * Loads what the seller card shows. The reviews come from KV (a job fills it), so this never calls Google.
 * @param app Request container.
 * @param store Settings snapshot the page already loaded.
 * @param locale Page language.
 * @returns The seller card and the invoicing group.
 */
export async function loadSellerTrust(
  app: Container,
  store: StoreContext,
  locale: Locale,
): Promise<LoadedSellerTrust> {
  const [invoicing, checkout, reviews] = await Promise.all([
    app.settings.get('invoicing'),
    app.settings.get('checkout'),
    app.reviews.forPage(locale),
  ]);
  const published = invoicing.showSellerIdentity;
  return {
    invoicing,
    seller: {
      legalName: published ? invoicing.legalName : '',
      taxIdType: invoicing.taxIdType,
      taxId: published ? invoicing.taxId : '',
      // The contact address and phone are what the visitor is given everywhere else; the invoicing ones are the fallback.
      address: store.contact.address || invoicing.address,
      phone: store.contact.phone || invoicing.phone,
      methods: availablePaymentMethods(
        app.gateways,
        { checkout, contact: store.contact, country: store.general.country },
        store.general.currency,
      ),
      reviews:
        reviews && reviews.rating !== null
          ? { rating: reviews.rating, count: reviews.ratingCount, mapsUri: reviews.mapsUri }
          : null,
    },
  };
}
