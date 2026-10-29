// Store settings, one zod schema per group. Every field has a default, so a group with no row in D1
// (a fresh store) still parses and the store works. Stored values are always validated before use.
// The maxima match the form definitions in settings-fields-store.ts and settings-fields-business.ts, so the server refuses
// what the form would refuse.
import '@/application/zod-config';
import { z } from 'zod';
import { GA4_MEASUREMENT_ID } from '@/domain/consent/consent';
import { DEFAULT_STORE_NAME } from '@/domain/content/store-defaults';
import { CURRENCY_CODES } from '@/domain/shared/currency';
import { isHttpsUrl, isKnownCountry, isValidTimeZone } from '@/domain/shared/validators';
import { PAYMENT_METHODS } from '../ports/payments';

/**
 * Two-language text with defaults for both languages.
 * @param es Default Spanish text.
 * @param en Default English text.
 * @param max Longest text per language, when the form sets one.
 */
const localized = (es = '', en = '', max?: number) => {
  const text = () => (max === undefined ? z.string() : z.string().max(max));
  return z.object({ es: text().default(es), en: text().default(en) }).default({ es, en });
};

/** Shared hex colour check: 6-digit hex only. */
const hexColor = (fallback: string) =>
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default(fallback);

/** A social profile link: empty, or an https address. Anything else (javascript:, data:) would become a clickable href. */
const socialLink = z
  .string()
  .max(300)
  .refine((value) => value === '' || isHttpsUrl(value), {
    message: 'Use an https:// address',
    params: { code: 'INVALID_LINK' },
  })
  .default('');

/** General store identity: name, logos, languages, currency and time zone. */
export const generalSettings = z.object({
  storeName: z.string().min(1).max(120).default(DEFAULT_STORE_NAME),
  logoMediaId: z.uuid().nullable().default(null),
  faviconMediaId: z.uuid().nullable().default(null),
  defaultLocale: z.enum(['es', 'en']).default('es'),
  currency: z.enum(CURRENCY_CODES).default('USD'),
  country: z
    .string()
    .length(2)
    .refine(isKnownCountry, { message: 'Unknown country code', params: { code: 'INVALID_COUNTRY' } })
    .default('CO'),
  timezone: z
    .string()
    .min(1)
    .max(60)
    .refine(isValidTimeZone, { message: 'Unknown time zone', params: { code: 'INVALID_TIMEZONE' } })
    .default('America/Bogota'),
  // One line shown in a strip above the header (a shipping offer, a sale). Empty hides the strip.
  announcement: localized('', '', 120),
});

/** Contact details, the WhatsApp button, the map and the social links. */
export const contactSettings = z.object({
  email: z
    .string()
    .max(254)
    .refine((value) => value === '' || z.email().safeParse(value).success, {
      message: 'Not an email address',
      params: { code: 'INVALID_EMAIL' },
    })
    .default(''),
  phone: z.string().max(40).default(''),
  whatsappNumber: z
    .string()
    .refine((value) => /^\d*$/.test(value), {
      message: 'Digits only, with country code',
      params: { code: 'DIGITS_ONLY' },
    })
    .max(20)
    .default(''),
  whatsappMessage: localized('Hola, quiero información.', 'Hi, I would like more information.', 300),
  showWhatsappFloat: z.boolean().default(true),
  address: z.string().max(300).default(''),
  mapsEmbedUrl: z
    .string()
    .max(500)
    .refine((v) => v === '' || v.startsWith('https://www.google.com/maps/embed?'), {
      message: 'Use a Google Maps embed URL',
      params: { code: 'MAPS_EMBED_URL' },
    })
    .default(''),
  openingHours: localized('', '', 300),
  social: z
    .object({
      instagram: socialLink,
      facebook: socialLink,
      tiktok: socialLink,
      youtube: socialLink,
      x: socialLink,
    })
    .default({ instagram: '', facebook: '', tiktok: '', youtube: '', x: '' }),
});

/** Colours and typography of the storefront. */
export const themeSettings = z.object({
  colorPrimary: hexColor('#111111'),
  colorOnPrimary: hexColor('#ffffff'),
  colorAccent: hexColor('#cf3426'),
  colorBackground: hexColor('#ffffff'),
  colorSurface: hexColor('#f4f4f2'),
  colorText: hexColor('#111111'),
  fontPreset: z.enum(['inter', 'manrope', 'playfair', 'editorial', 'volt']).default('volt'),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'full']).default('md'),
});

/** How the product list is paged, sorted and marked for stock. */
export const catalogSettings = z.object({
  pageSize: z.number().int().min(6).max(60).default(24),
  newDays: z.number().int().min(1).max(365).default(30),
  defaultSort: z.enum(['featured', 'newest', 'price_asc', 'price_desc', 'best_sellers']).default('featured'),
  showOutOfStock: z.enum(['last', 'hide', 'normal']).default('last'),
  showStockOnProduct: z.enum(['never', 'low', 'always']).default('low'),
  lowStockDisplayThreshold: z.number().int().min(0).default(5),
});

/** Low-stock alerts and back-in-stock notices. */
export const inventorySettings = z.object({
  defaultLowStockThreshold: z.number().int().min(0).default(3),
  lowStockAlerts: z.boolean().default(true),
  lowStockAlertChannels: z.array(z.enum(['email', 'whatsapp'])).default(['email']),
  backInStockEnabled: z.boolean().default(true),
});

/** Payment methods offered at checkout, their holds and the PayPal settlement. */
export const checkoutSettings = z.object({
  enabledMethods: z.array(z.enum(PAYMENT_METHODS)).default(['whatsapp']),
  bankTransferInstructions: localized('', '', 1000),
  // Deuna! is a wallet: the instructions are the number or the alias the buyer sends the money to from the app.
  deunaInstructions: localized('', '', 1000),
  cashOnDeliveryNote: localized('', '', 500),
  onlineHoldMinutes: z.number().int().min(15).max(1440).default(45),
  manualAutoCancelDays: z.number().int().min(0).max(60).default(0),
  paypalSettlementCurrency: z.enum(['USD', 'EUR']).nullable().default(null),
  paypalExchangeRate: z.number().positive().nullable().default(null),
  orderNotificationEmail: z.string().max(254).default(''),
  whatsappOptInDefault: z.boolean().default(false),
});

/** Tax rate, its label and how it is shown. */
export const taxSettings = z.object({
  pricesIncludeTax: z.boolean().default(true),
  defaultRateBp: z.number().int().min(0).max(10_000).default(1900),
  label: localized('IVA', 'VAT', 20),
  taxShipping: z.boolean().default(false),
  showBreakdown: z.boolean().default(true),
});

/** Invoice issuing and the seller data printed on invoices and shown to the buyer in the store. */
export const invoicingSettings = z.object({
  enabled: z.boolean().default(false),
  autoIssue: z.enum(['on_paid', 'manual']).default('on_paid'),
  series: z
    .string()
    .regex(/^[A-Z]{1,6}$/)
    .default('FV'),
  legalName: z.string().max(200).default(''),
  taxId: z.string().max(40).default(''),
  taxIdType: z.string().max(20).default('NIT'),
  // The seller card on the product and checkout pages. A buyer who cannot tell who is selling abandons the order, so
  // the identity is published by default; a store that must not publish it turns this off.
  showSellerIdentity: z.boolean().default(true),
  taxRegime: z.string().max(100).default(''),
  address: z.string().max(300).default(''),
  phone: z.string().max(40).default(''),
  email: z.string().max(254).default(''),
  footerNotes: localized('', '', 500),
  attachPdf: z.boolean().default(true),
  askBuyerTaxId: z.boolean().default(true),
  sendPdfByWhatsapp: z.boolean().default(true),
});

/** WhatsApp alerts to the store and the default country code. */
export const whatsappSettings = z.object({
  enabled: z.boolean().default(false),
  alertsNumber: z.string().regex(/^\d*$/).max(20).default(''),
  defaultCountryCode: z
    .string()
    .regex(/^\d{1,3}$/)
    .default('57'),
});

/** Tracking pixels, the product feed and the cookie notice. */
export const marketingSettings = z.object({
  metaPixelId: z.string().max(40).default(''),
  metaCapiEnabled: z.boolean().default(false),
  metaTestEventCode: z.string().max(40).default(''),
  ga4MeasurementId: z
    .string()
    .trim()
    .refine((value) => value === '' || GA4_MEASUREMENT_ID.test(value))
    .default(''),
  feedEnabled: z.boolean().default(true),
  feedBrand: z.string().max(100).default(''),
  feedColorAttribute: z.string().max(40).default('color'),
  feedSizeAttribute: z.string().max(40).default('size'),
  consentBannerMode: z.enum(['auto', 'always']).default('auto'),
});

/** The weekly summary schedule and the slow-mover rule. */
export const reportsSettings = z.object({
  weeklySummaryEnabled: z.boolean().default(true),
  weeklySummaryWeekday: z.number().int().min(0).max(6).default(1),
  weeklySummaryHour: z.number().int().min(0).max(23).default(8),
  slowMoverDays: z.number().int().min(7).max(365).default(60),
});

/** Search-engine title template, default description and social sharing image. */
export const seoSettings = z.object({
  titleTemplate: localized('%s | Tienda', '%s | Store', 120),
  defaultDescription: localized('', '', 300),
  ogImageMediaId: z.uuid().nullable().default(null),
});

/** Google reviews and the web analytics token. */
export const integrationSettings = z.object({
  googlePlaceId: z.string().max(100).default(''),
  showGoogleReviews: z.boolean().default(false),
  webAnalyticsToken: z.string().max(100).default(''),
});

/** Every settings group, keyed by its row name in the settings table. */
export const SETTINGS_SCHEMAS = {
  general: generalSettings,
  contact: contactSettings,
  theme: themeSettings,
  catalog: catalogSettings,
  inventory: inventorySettings,
  checkout: checkoutSettings,
  tax: taxSettings,
  invoicing: invoicingSettings,
  whatsapp: whatsappSettings,
  marketing: marketingSettings,
  reports: reportsSettings,
  seo: seoSettings,
  integrations: integrationSettings,
} as const;

/** One of the settings group names. */
export type SettingsGroup = keyof typeof SETTINGS_SCHEMAS;

/** The parsed value of each settings group. */
export type SettingsMap = { [G in SettingsGroup]: z.infer<(typeof SETTINGS_SCHEMAS)[G]> };
