// Shape of the "changes we make for you" service and the helpers that turn it into table rows.
// The amounts are NOT here: they come from e-baq.com/precios.json through precios.ts, so a price is edited in one place.
// What stays here is product shape — how many credits a pack carries, how many a plan gives — which is not a price.
import { cargarPrecios, CLAVE_REGION, type TablaPrecios } from './precios';
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

/** Store check-ups included in a yearly plan, per year: a look at texts, prices, stock, links and the buying flow, with a short report. */
export const YEARLY_CHECKUPS = { basic: 0, grow: 4, pro: 12 } as const;

/** Response time of each plan, in business days; 0 means the same business day. Shared by all regions. */
export const PLAN_RESPONSE_DAYS = { basic: 5, grow: 3, pro: 2 } as const;

/** Credits each prepaid pack carries. How many credits a pack buys is product shape; what it costs is a price. */
const PACK_CREDITS = [5, 10, 20] as const;

/** Credits each subscription gives per month. The same everywhere, so the three offers stay comparable between regions. */
const PLAN_CREDITS = { basic: 4, grow: 10, pro: 25 } as const;

/** The currency each region pays in. Not a price, so it does not travel in the price table. */
const CURRENCY: Record<Region, 'USD' | 'MXN'> = { intl: 'USD', mx: 'MXN', ec: 'USD' };

/**
 * One product's amount for one region. It throws instead of returning a default because a missing price would render as "$NaN"
 * on a page a client reads: a build that fails loudly is cheaper than a quote built on a number nobody wrote.
 */
function monto(tabla: TablaPrecios, producto: string, region: Region): number {
  const precio = tabla[producto]?.[CLAVE_REGION[region]];
  if (!precio) throw new Error(`precios.json no trae "${producto}" para ${CLAVE_REGION[region]}`);
  return precio.monto;
}

/** The change-service prices of every region, read from the published table. Pack and plan keys are derived from their shape. */
export async function cargarPreciosCambios(): Promise<Record<Region, RegionPrices>> {
  const tabla = await cargarPrecios();
  const forRegion = (region: Region): RegionPrices => ({
    currency: CURRENCY[region],
    credit: monto(tabla, 'cambio-suelto', region),
    packs: PACK_CREDITS.map((credits) => ({
      credits,
      price: monto(tabla, `paquete-${credits}`, region),
    })),
    plans: (Object.keys(PLAN_CREDITS) as Plan['id'][]).map((id) => ({
      id,
      creditsPerMonth: PLAN_CREDITS[id],
      monthly: monto(tabla, `plan-cambios-${id}`, region),
    })),
  });
  return { intl: forRegion('intl'), mx: forRegion('mx'), ec: forRegion('ec') };
}

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
    currency: CURRENCY[region],
    currencyDisplay: 'code',
    useGrouping: 'always',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(amount)
    .replace(/ /g, ' ');
}

/** Share saved by buying `credits` credits as a pack instead of one by one, as a whole percentage. */
export function packSavingPercent(prices: RegionPrices, pack: Pack): number {
  const full = prices.credit * pack.credits;
  return Math.round(((full - pack.price) / full) * 100);
}
