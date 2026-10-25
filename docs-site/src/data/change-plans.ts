// Prices for the "changes we make for you" service, per region, and the helpers that turn them into table rows.
// Edit the numbers here only: the guide pages and the tables read from this file. Prices are before tax.
import type { REGIONS } from './regions.mjs';

/** One of the regions in regions.mjs. */
export type Region = (typeof REGIONS)[number];

/** Languages the guide is written in. */
export type Lang = 'es' | 'en';

/** Credits a change costs, by size. A credit is the unit every price below is built from. */
export const CHANGE_SIZES = [
  { id: 'small', credits: 1 },
  { id: 'medium', credits: 2 },
  { id: 'large', credits: 5 },
] as const;

/** A prepaid pack: credits bought once and valid for 12 months. */
interface Pack {
  credits: number;
  price: number;
}

/** A subscription: credits every month, a response time, and a monthly price. The yearly price is `YEARLY_MONTHS` months of it. */
interface Plan {
  id: 'basic' | 'grow' | 'pro';
  creditsPerMonth: number;
  monthly: number;
}

/** Prices for one region, in its currency's whole units. */
interface RegionPrices {
  currency: 'USD' | 'MXN';
  /** Price of one credit, paid per change. */
  credit: number;
  packs: Pack[];
  plans: Plan[];
}

/** Months paid for a year of any plan: the yearly price is this many monthly prices, which is two months free. */
export const YEARLY_MONTHS = 10;

/** Response time of each plan, in business days; 0 means the same business day. Shared by all regions. */
export const PLAN_RESPONSE_DAYS = { basic: 2, grow: 1, pro: 0 } as const;

/** Pack and plan credit counts are the same everywhere; only the price changes, so the shape of each offer stays comparable. */
export const PRICES: Record<Region, RegionPrices> = {
  intl: {
    currency: 'USD',
    credit: 9,
    packs: [
      { credits: 5, price: 40 },
      { credits: 10, price: 72 },
      { credits: 20, price: 126 },
    ],
    plans: [
      { id: 'basic', creditsPerMonth: 4, monthly: 27 },
      { id: 'grow', creditsPerMonth: 10, monthly: 63 },
      { id: 'pro', creditsPerMonth: 25, monthly: 145 },
    ],
  },
  mx: {
    currency: 'MXN',
    credit: 149,
    packs: [
      { credits: 5, price: 670 },
      { credits: 10, price: 1190 },
      { credits: 20, price: 2090 },
    ],
    plans: [
      { id: 'basic', creditsPerMonth: 4, monthly: 449 },
      { id: 'grow', creditsPerMonth: 10, monthly: 1049 },
      { id: 'pro', creditsPerMonth: 25, monthly: 2390 },
    ],
  },
  // Ecuador uses US dollars, but local prices are lower than the international ones.
  ec: {
    currency: 'USD',
    credit: 5,
    packs: [
      { credits: 5, price: 22 },
      { credits: 10, price: 40 },
      { credits: 20, price: 70 },
    ],
    plans: [
      { id: 'basic', creditsPerMonth: 4, monthly: 15 },
      { id: 'grow', creditsPerMonth: 10, monthly: 35 },
      { id: 'pro', creditsPerMonth: 25, monthly: 80 },
    ],
  },
};

/** Number format used to write amounts: Mexican readers expect "1,190", Ecuadorian ones "1.190", and everyone else a US-style one. */
const LOCALES: Record<Lang, Record<Region, string>> = {
  es: { intl: 'es-US', mx: 'es-MX', ec: 'es-EC' },
  en: { intl: 'en-US', mx: 'en-US', ec: 'en-US' },
};

/**
 * Formats an amount with its ISO code ("149 MXN"), because "$" alone would not tell pesos from dollars. Grouping is always on, so
 * 1,190 and 10,490 look alike. `decimals` is 0 for prices and 2 for a per-credit price such as 4.60.
 */
export function formatMoney(amount: number, region: Region, lang: Lang, decimals = 0): string {
  return new Intl.NumberFormat(LOCALES[lang][region], {
    style: 'currency',
    currency: PRICES[region].currency,
    currencyDisplay: 'code',
    useGrouping: 'always',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(amount)
    .replace(/ /g, ' ');
}

/** Share saved by buying `credits` credits as a pack instead of one by one, as a whole percentage. */
export function packSavingPercent(prices: RegionPrices, pack: Pack): number {
  const full = prices.credit * pack.credits;
  return Math.round(((full - pack.price) / full) * 100);
}
