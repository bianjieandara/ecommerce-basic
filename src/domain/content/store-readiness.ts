// The setup checklist of a new store: what the owner still has to do before the store can sell. The dashboard shows it until
// every item is done. The rules live here so the dashboard and any later check (a deploy gate, a test) give the same answer.
import { LEGAL_PAGE_SLUGS } from './page';
import { DEFAULT_STORE_NAME } from './store-defaults';

/** The checklist items, in the order the owner should do them. */
export const READINESS_ITEMS = ['storeName', 'logo', 'product', 'shipping', 'payment', 'legalPages'] as const;

/** One checklist item. */
export type ReadinessItem = (typeof READINESS_ITEMS)[number];

/** What the checklist is computed from. The counts come from one read of the database. */
export interface ReadinessFacts {
  storeName: string;
  hasLogo: boolean;
  /** Products with status "active". */
  activeProducts: number;
  /** Shipping methods that checkout offers. */
  activeShippingMethods: number;
  /** Payment methods switched on in Settings › Checkout. */
  enabledPaymentMethods: number;
  /** Legal pages that have been saved at least once (a page without a row shows its code default, not owner text). */
  legalPagesSaved: number;
}

/** One item and whether it is done. */
export interface ReadinessStatus {
  item: ReadinessItem;
  done: boolean;
}

/**
 * Works out each checklist item from the facts.
 * @param facts Store settings and counts.
 * @returns Every item in checklist order, with whether it is done.
 */
export function storeReadiness(facts: ReadinessFacts): ReadinessStatus[] {
  const done: Record<ReadinessItem, boolean> = {
    storeName: facts.storeName.trim() !== '' && facts.storeName !== DEFAULT_STORE_NAME,
    logo: facts.hasLogo,
    product: facts.activeProducts > 0,
    shipping: facts.activeShippingMethods > 0,
    payment: facts.enabledPaymentMethods > 0,
    legalPages: facts.legalPagesSaved >= LEGAL_PAGE_SLUGS.length,
  };
  return READINESS_ITEMS.map((item) => ({ item, done: done[item] }));
}
