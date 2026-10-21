// What presentation components need to know about the store and the request: language, currency and tax display.
import type { CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';

/** Store-level values passed to presentation components instead of settings objects. */
export interface StoreView {
  locale: Locale;
  currency: CurrencyCode;
  country: string;
  pricesIncludeTax: boolean;
  storeName: string;
}
