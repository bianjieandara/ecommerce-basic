// Form definitions of the business groups: checkout, tax, invoicing, WhatsApp, marketing, reports, SEO and integrations. Each
// key is a field of the group's zod schema in settings-schemas.ts. Labels are bilingual, as in the other definitions.
import { bilingual } from '@/domain/shared/localized-text';
import { PAYMENT_METHODS, type PaymentMethod } from '../ports/payments';
import { option, type GroupFields } from './settings-field-types';

/** The business groups defined here. */
type BusinessGroup =
  'checkout' | 'tax' | 'invoicing' | 'whatsapp' | 'marketing' | 'reports' | 'seo' | 'integrations';

/** Spanish and English names of the payment methods, typed so a new method cannot be left unnamed. */
const METHOD_LABELS: Record<PaymentMethod, [string, string]> = {
  dlocalgo: ['Tarjeta (dLocal Go)', 'Card (dLocal Go)'],
  paypal: ['PayPal', 'PayPal'],
  whatsapp: ['WhatsApp', 'WhatsApp'],
  bank_transfer: ['Transferencia bancaria', 'Bank transfer'],
  cash_on_delivery: ['Pago contra entrega', 'Cash on delivery'],
};

/** Form definitions of the business groups, checked against their schemas. */
export const businessFieldDefinitions = {
  checkout: {
    enabledMethods: {
      kind: 'multiselect',
      label: bilingual('Formas de pago activas', 'Active payment methods'),
      options: PAYMENT_METHODS.map((method) => option(method, ...METHOD_LABELS[method])),
    },
    bankTransferInstructions: {
      kind: 'localizedTextarea',
      label: bilingual('Datos para la transferencia', 'Bank transfer details'),
      max: 1000,
    },
    cashOnDeliveryNote: {
      kind: 'localizedTextarea',
      label: bilingual('Nota para pago contra entrega', 'Cash on delivery note'),
      max: 500,
    },
    onlineHoldMinutes: {
      kind: 'number',
      label: bilingual(
        'Minutos que se reserva el stock al pagar en línea',
        'Minutes stock is held for online payment',
      ),
      min: 15,
      max: 1440,
      step: 1,
    },
    manualAutoCancelDays: {
      kind: 'number',
      label: bilingual(
        'Días para cancelar pedidos sin pagar (0 = nunca)',
        'Days before unpaid orders are cancelled (0 = never)',
      ),
      min: 0,
      max: 60,
      step: 1,
    },
    paypalSettlementCurrency: {
      kind: 'select',
      label: bilingual('Moneda de liquidación de PayPal', 'PayPal settlement currency'),
      options: [option('USD', 'USD', 'USD'), option('EUR', 'EUR', 'EUR')],
      nullable: true,
    },
    paypalExchangeRate: {
      kind: 'number',
      label: bilingual('Tasa de cambio para PayPal', 'PayPal exchange rate'),
      // Same rule as the schema (positive): zero is refused by both, so the form never offers a value the server refuses.
      min: 0.0001,
      step: 0.0001,
      nullable: true,
    },
    orderNotificationEmail: {
      kind: 'email',
      label: bilingual('Correo que recibe los pedidos', 'Email that receives orders'),
      max: 254,
    },
    whatsappOptInDefault: {
      kind: 'boolean',
      label: bilingual(
        'Marcar por defecto "recibir avisos por WhatsApp"',
        'Tick "send me WhatsApp updates" by default',
      ),
    },
  },
  tax: {
    pricesIncludeTax: {
      kind: 'boolean',
      label: bilingual('Los precios incluyen impuesto', 'Prices include tax'),
    },
    defaultRateBp: {
      kind: 'number',
      label: bilingual(
        'Tasa por defecto (puntos básicos: 1900 = 19 %)',
        'Default rate (basis points: 1900 = 19%)',
      ),
      min: 0,
      max: 10000,
      step: 1,
    },
    label: { kind: 'localizedText', label: bilingual('Nombre del impuesto', 'Tax name'), max: 20 },
    taxShipping: { kind: 'boolean', label: bilingual('Aplicar impuesto al envío', 'Apply tax to shipping') },
    showBreakdown: {
      kind: 'boolean',
      label: bilingual('Mostrar el desglose del impuesto', 'Show the tax breakdown'),
    },
  },
  invoicing: {
    enabled: { kind: 'boolean', label: bilingual('Emitir facturas', 'Issue invoices') },
    autoIssue: {
      kind: 'select',
      label: bilingual('Cuándo emitir', 'When to issue'),
      options: [option('on_paid', 'Al pagar', 'When paid'), option('manual', 'A mano', 'By hand')],
    },
    series: {
      kind: 'text',
      label: bilingual('Serie (letras mayúsculas)', 'Series (capital letters)'),
      required: true,
      max: 6,
    },
    legalName: { kind: 'text', label: bilingual('Razón social', 'Legal name'), max: 200 },
    taxId: { kind: 'text', label: bilingual('Identificación fiscal', 'Tax ID'), max: 40 },
    taxIdType: { kind: 'text', label: bilingual('Tipo de identificación', 'Tax ID type'), max: 20 },
    taxRegime: { kind: 'text', label: bilingual('Régimen fiscal', 'Tax regime'), max: 100 },
    address: { kind: 'textarea', label: bilingual('Dirección fiscal', 'Legal address'), max: 300 },
    phone: { kind: 'tel', label: bilingual('Teléfono de facturación', 'Invoicing phone'), max: 40 },
    email: { kind: 'email', label: bilingual('Correo de facturación', 'Invoicing email'), max: 254 },
    footerNotes: { kind: 'localizedTextarea', label: bilingual('Notas al pie', 'Footer notes'), max: 500 },
    attachPdf: {
      kind: 'boolean',
      label: bilingual('Adjuntar el PDF al correo', 'Attach the PDF to the email'),
    },
    askBuyerTaxId: {
      kind: 'boolean',
      label: bilingual(
        'Pedir razón social e identificación fiscal al comprador',
        'Ask the buyer for company name and tax ID',
      ),
    },
    sendPdfByWhatsapp: {
      kind: 'boolean',
      label: bilingual('Enviar el PDF también por WhatsApp', 'Also send the PDF by WhatsApp'),
    },
  },
  whatsapp: {
    enabled: { kind: 'boolean', label: bilingual('Activar WhatsApp', 'Turn on WhatsApp') },
    alertsNumber: {
      kind: 'tel',
      label: bilingual('Número para avisos a la tienda', 'Number for store alerts'),
      max: 20,
    },
    defaultCountryCode: {
      kind: 'text',
      label: bilingual('Indicativo de país por defecto', 'Default country code'),
      max: 3,
    },
  },
  marketing: {
    metaPixelId: { kind: 'text', label: bilingual('ID del píxel de Meta', 'Meta Pixel ID'), max: 40 },
    metaCapiEnabled: {
      kind: 'boolean',
      label: bilingual('Enviar eventos de conversión a Meta', 'Send conversion events to Meta'),
    },
    metaTestEventCode: {
      kind: 'text',
      label: bilingual('Código de prueba de Meta', 'Meta test event code'),
      max: 40,
    },
    feedEnabled: {
      kind: 'boolean',
      label: bilingual('Publicar el catálogo de productos', 'Publish the product feed'),
    },
    feedBrand: { kind: 'text', label: bilingual('Marca en el catálogo', 'Brand in the feed'), max: 100 },
    feedColorAttribute: {
      kind: 'text',
      label: bilingual('Atributo de color', 'Color attribute code'),
      max: 40,
    },
    feedSizeAttribute: {
      kind: 'text',
      label: bilingual('Atributo de talla', 'Size attribute code'),
      max: 40,
    },
    consentBannerMode: {
      kind: 'select',
      label: bilingual('Aviso de cookies', 'Cookie notice'),
      options: [
        option('auto', 'Solo si hay herramientas de marketing', 'Only when marketing tools are on'),
        option('always', 'Siempre', 'Always'),
      ],
    },
  },
  reports: {
    weeklySummaryEnabled: {
      kind: 'boolean',
      label: bilingual('Enviar el resumen semanal', 'Send the weekly summary'),
    },
    weeklySummaryWeekday: {
      kind: 'number',
      label: bilingual('Día del resumen (0 = domingo)', 'Summary day (0 = Sunday)'),
      min: 0,
      max: 6,
      step: 1,
    },
    weeklySummaryHour: {
      kind: 'number',
      label: bilingual('Hora del resumen (0 a 23)', 'Summary hour (0 to 23)'),
      min: 0,
      max: 23,
      step: 1,
    },
    slowMoverDays: {
      kind: 'number',
      label: bilingual('Días sin venta para "de baja rotación"', 'Days without a sale for "slow mover"'),
      min: 7,
      max: 365,
      step: 1,
    },
  },
  seo: {
    titleTemplate: {
      kind: 'localizedText',
      label: bilingual('Plantilla del título (%s = nombre de la página)', 'Title template (%s = page name)'),
      max: 120,
    },
    defaultDescription: {
      kind: 'localizedTextarea',
      label: bilingual('Descripción por defecto', 'Default description'),
      max: 300,
    },
    ogImageMediaId: { kind: 'image', label: bilingual('Imagen para redes sociales', 'Social sharing image') },
  },
  integrations: {
    googlePlaceId: { kind: 'text', label: bilingual('ID del lugar en Google', 'Google Place ID'), max: 100 },
    showGoogleReviews: {
      kind: 'boolean',
      label: bilingual('Mostrar reseñas de Google', 'Show Google reviews'),
    },
    webAnalyticsToken: {
      kind: 'text',
      label: bilingual('Token de Cloudflare Web Analytics', 'Cloudflare Web Analytics token'),
      max: 100,
    },
  },
} satisfies { [G in BusinessGroup]: GroupFields<G> };
