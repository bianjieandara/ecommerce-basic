// Store settings, one zod schema per group. Every field has a default, so a group with no row in D1
// (a fresh store) still parses and the store works. Stored values are always validated before use.
import { z } from 'zod';

/** Two-language text with defaults for both languages. */
const localized = (es = '', en = '') =>
  z.object({ es: z.string().default(es), en: z.string().default(en) }).default({ es, en });

/** Shared hex colour check: 6-digit hex only. */
const hexColor = (fallback: string) =>
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default(fallback);

export const generalSettings = z.object({
  storeName: z.string().min(1).max(120).default('My Store'),
  logoMediaId: z.uuid().nullable().default(null),
  faviconMediaId: z.uuid().nullable().default(null),
  defaultLocale: z.enum(['es', 'en']).default('es'),
  currency: z.enum(['USD', 'EUR', 'COP', 'MXN', 'PEN', 'CLP', 'ARS']).default('USD'),
  country: z.string().length(2).default('CO'),
  timezone: z.string().min(1).default('America/Bogota'),
});

export const contactSettings = z.object({
  email: z.string().default(''),
  phone: z.string().default(''),
  whatsappNumber: z.string().regex(/^\d*$/, 'Digits only, with country code').default(''),
  whatsappMessage: localized('Hola, quiero información.', 'Hi, I would like more information.'),
  showWhatsappFloat: z.boolean().default(true),
  address: z.string().default(''),
  mapsEmbedUrl: z
    .string()
    .refine(
      (v) => v === '' || v.startsWith('https://www.google.com/maps/embed?'),
      'Use a Google Maps embed URL',
    )
    .default(''),
  openingHours: localized(),
  social: z
    .object({
      instagram: z.string().default(''),
      facebook: z.string().default(''),
      tiktok: z.string().default(''),
      youtube: z.string().default(''),
      x: z.string().default(''),
    })
    .default({ instagram: '', facebook: '', tiktok: '', youtube: '', x: '' }),
});

export const themeSettings = z.object({
  colorPrimary: hexColor('#111111'),
  colorOnPrimary: hexColor('#ffffff'),
  colorAccent: hexColor('#d62828'),
  colorBackground: hexColor('#ffffff'),
  colorSurface: hexColor('#f5f5f5'),
  colorText: hexColor('#111111'),
  fontPreset: z.enum(['inter', 'manrope', 'playfair']).default('inter'),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'full']).default('md'),
});

export const catalogSettings = z.object({
  pageSize: z.number().int().min(6).max(60).default(24),
  newDays: z.number().int().min(1).max(365).default(30),
  defaultSort: z.enum(['featured', 'newest', 'price_asc', 'price_desc', 'best_sellers']).default('featured'),
  showOutOfStock: z.enum(['last', 'hide', 'normal']).default('last'),
  showStockOnProduct: z.enum(['never', 'low', 'always']).default('low'),
  lowStockDisplayThreshold: z.number().int().min(0).default(5),
});

export const inventorySettings = z.object({
  defaultLowStockThreshold: z.number().int().min(0).default(3),
  lowStockAlerts: z.boolean().default(true),
  lowStockAlertChannels: z.array(z.enum(['email', 'whatsapp'])).default(['email']),
  backInStockEnabled: z.boolean().default(true),
});

export const checkoutSettings = z.object({
  enabledMethods: z
    .array(z.enum(['stripe', 'paypal', 'whatsapp', 'bank_transfer', 'cash_on_delivery']))
    .default(['whatsapp']),
  bankTransferInstructions: localized(),
  cashOnDeliveryNote: localized(),
  onlineHoldMinutes: z.number().int().min(15).max(1440).default(45),
  manualAutoCancelDays: z.number().int().min(0).max(60).default(0),
  paypalSettlementCurrency: z.enum(['USD', 'EUR']).nullable().default(null),
  paypalExchangeRate: z.number().positive().nullable().default(null),
  orderNotificationEmail: z.string().default(''),
  whatsappOptInDefault: z.boolean().default(false),
});

export const taxSettings = z.object({
  pricesIncludeTax: z.boolean().default(true),
  defaultRateBp: z.number().int().min(0).max(10_000).default(1900),
  label: localized('IVA', 'VAT'),
  taxShipping: z.boolean().default(false),
  showBreakdown: z.boolean().default(true),
});

export const invoicingSettings = z.object({
  enabled: z.boolean().default(false),
  autoIssue: z.enum(['on_paid', 'manual']).default('on_paid'),
  series: z
    .string()
    .regex(/^[A-Z]{1,6}$/)
    .default('FV'),
  legalName: z.string().default(''),
  taxId: z.string().default(''),
  taxIdType: z.string().default('NIT'),
  taxRegime: z.string().default(''),
  address: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  footerNotes: localized(),
  attachPdf: z.boolean().default(true),
  askBuyerTaxId: z.boolean().default(true),
  sendPdfByWhatsapp: z.boolean().default(true),
});

export const whatsappSettings = z.object({
  enabled: z.boolean().default(false),
  alertsNumber: z.string().regex(/^\d*$/).default(''),
  defaultCountryCode: z
    .string()
    .regex(/^\d{1,3}$/)
    .default('57'),
});

export const marketingSettings = z.object({
  metaPixelId: z.string().default(''),
  metaCapiEnabled: z.boolean().default(false),
  metaTestEventCode: z.string().default(''),
  feedEnabled: z.boolean().default(true),
  feedBrand: z.string().default(''),
  feedColorAttribute: z.string().default('color'),
  feedSizeAttribute: z.string().default('size'),
  consentBannerMode: z.enum(['auto', 'always']).default('auto'),
});

export const reportsSettings = z.object({
  weeklySummaryEnabled: z.boolean().default(true),
  weeklySummaryWeekday: z.number().int().min(0).max(6).default(1),
  weeklySummaryHour: z.number().int().min(0).max(23).default(8),
  slowMoverDays: z.number().int().min(7).max(365).default(60),
});

export const seoSettings = z.object({
  titleTemplate: localized('%s | Tienda', '%s | Store'),
  defaultDescription: localized(),
  ogImageMediaId: z.uuid().nullable().default(null),
});

export const integrationSettings = z.object({
  googlePlaceId: z.string().default(''),
  showGoogleReviews: z.boolean().default(false),
  webAnalyticsToken: z.string().default(''),
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
