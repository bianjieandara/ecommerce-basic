// Form definitions of the store groups: general, contact, theme, catalog and inventory. Each key is a field of the group's zod
// schema in settings-schemas.ts. Labels are bilingual, as in the widget and email definitions, so the form and the page
// builder read one definition each.
import { CURRENCIES } from '@/domain/shared/currency';
import { bilingual } from '@/domain/shared/localized-text';
import { option, type GroupFields } from './settings-field-types';

/** The store groups defined here. */
type StoreGroup = 'general' | 'contact' | 'theme' | 'catalog' | 'inventory';

const CURRENCY_OPTIONS = Object.keys(CURRENCIES).map((code) => option(code, code, code));

/** Form definitions of the store groups, checked against their schemas. */
export const storeFieldDefinitions = {
  general: {
    storeName: {
      kind: 'text',
      label: bilingual('Nombre de la tienda', 'Store name'),
      required: true,
      max: 120,
    },
    logoMediaId: { kind: 'image', label: bilingual('Logo', 'Logo') },
    faviconMediaId: { kind: 'image', label: bilingual('Icono del navegador', 'Browser icon') },
    defaultLocale: {
      kind: 'select',
      label: bilingual('Idioma principal', 'Main language'),
      options: [option('es', 'Español', 'Spanish'), option('en', 'Inglés', 'English')],
    },
    currency: { kind: 'select', label: bilingual('Moneda', 'Currency'), options: CURRENCY_OPTIONS },
    country: {
      kind: 'text',
      label: bilingual('País (código de dos letras)', 'Country (two-letter code)'),
      required: true,
      max: 2,
    },
    timezone: { kind: 'text', label: bilingual('Zona horaria', 'Time zone'), required: true, max: 60 },
  },
  contact: {
    email: { kind: 'email', label: bilingual('Correo de contacto', 'Contact email'), max: 254 },
    phone: { kind: 'tel', label: bilingual('Teléfono', 'Phone'), max: 40 },
    whatsappNumber: {
      kind: 'tel',
      label: bilingual(
        'WhatsApp (solo dígitos, con indicativo)',
        'WhatsApp (digits only, with country code)',
      ),
      max: 20,
    },
    whatsappMessage: {
      kind: 'localizedTextarea',
      label: bilingual('Mensaje inicial de WhatsApp', 'WhatsApp opening message'),
      max: 300,
    },
    showWhatsappFloat: {
      kind: 'boolean',
      label: bilingual('Mostrar el botón flotante de WhatsApp', 'Show the floating WhatsApp button'),
    },
    address: { kind: 'textarea', label: bilingual('Dirección', 'Address'), max: 300 },
    mapsEmbedUrl: {
      kind: 'url',
      label: bilingual('Enlace de Google Maps (embed)', 'Google Maps embed link'),
      max: 500,
    },
    openingHours: {
      kind: 'localizedTextarea',
      label: bilingual('Horario de atención', 'Opening hours'),
      max: 300,
    },
    social: {
      kind: 'object',
      label: bilingual('Redes sociales', 'Social media'),
      fields: [
        { name: 'instagram', kind: 'url', label: bilingual('Instagram', 'Instagram'), max: 300 },
        { name: 'facebook', kind: 'url', label: bilingual('Facebook', 'Facebook'), max: 300 },
        { name: 'tiktok', kind: 'url', label: bilingual('TikTok', 'TikTok'), max: 300 },
        { name: 'youtube', kind: 'url', label: bilingual('YouTube', 'YouTube'), max: 300 },
        { name: 'x', kind: 'url', label: bilingual('X (Twitter)', 'X (Twitter)'), max: 300 },
      ],
    },
  },
  theme: {
    colorPrimary: { kind: 'color', label: bilingual('Color principal', 'Primary color') },
    colorOnPrimary: {
      kind: 'color',
      label: bilingual('Texto sobre el color principal', 'Text on the primary color'),
    },
    colorAccent: {
      kind: 'color',
      label: bilingual('Color de acento (ofertas, avisos)', 'Accent color (sales, alerts)'),
    },
    colorBackground: { kind: 'color', label: bilingual('Fondo', 'Background') },
    colorSurface: { kind: 'color', label: bilingual('Superficies (tarjetas)', 'Surfaces (cards)') },
    colorText: { kind: 'color', label: bilingual('Texto', 'Text') },
    fontPreset: {
      kind: 'select',
      label: bilingual('Tipografía', 'Typeface'),
      options: [
        option('inter', 'Inter', 'Inter'),
        option('manrope', 'Manrope', 'Manrope'),
        option('playfair', 'Playfair Display', 'Playfair Display'),
      ],
    },
    radius: {
      kind: 'select',
      label: bilingual('Esquinas', 'Corners'),
      options: [
        option('none', 'Rectas', 'Square'),
        option('sm', 'Poco redondeadas', 'Slightly rounded'),
        option('md', 'Medias', 'Medium'),
        option('lg', 'Redondeadas', 'Rounded'),
        option('full', 'Totalmente redondeadas', 'Fully rounded'),
      ],
    },
  },
  catalog: {
    pageSize: {
      kind: 'number',
      label: bilingual('Productos por página', 'Products per page'),
      min: 6,
      max: 60,
      step: 1,
    },
    newDays: {
      kind: 'number',
      label: bilingual('Días en que un producto es nuevo', 'Days a product counts as new'),
      min: 1,
      max: 365,
      step: 1,
    },
    defaultSort: {
      kind: 'select',
      label: bilingual('Orden por defecto', 'Default sort'),
      options: [
        option('featured', 'Destacados', 'Featured'),
        option('newest', 'Más nuevos', 'Newest'),
        option('price_asc', 'Precio: menor a mayor', 'Price: low to high'),
        option('price_desc', 'Precio: mayor a menor', 'Price: high to low'),
        option('best_sellers', 'Más vendidos', 'Best sellers'),
      ],
    },
    showOutOfStock: {
      kind: 'select',
      label: bilingual('Productos agotados', 'Out-of-stock products'),
      options: [
        option('last', 'Al final', 'At the end'),
        option('hide', 'Ocultarlos', 'Hide them'),
        option('normal', 'Como cualquier otro', 'Like any other'),
      ],
    },
    showStockOnProduct: {
      kind: 'select',
      label: bilingual('Mostrar existencias en el producto', 'Show stock on the product'),
      options: [
        option('never', 'Nunca', 'Never'),
        option('low', 'Solo si quedan pocas', 'Only when low'),
        option('always', 'Siempre', 'Always'),
      ],
    },
    lowStockDisplayThreshold: {
      kind: 'number',
      label: bilingual('"Pocas unidades" desde (unidades)', 'Low stock from (units)'),
      min: 0,
      step: 1,
    },
  },
  inventory: {
    defaultLowStockThreshold: {
      kind: 'number',
      label: bilingual('Stock bajo por defecto (unidades)', 'Default low-stock level (units)'),
      min: 0,
      step: 1,
    },
    lowStockAlerts: {
      kind: 'boolean',
      label: bilingual('Avisar cuando el stock esté bajo', 'Alert when stock is low'),
    },
    lowStockAlertChannels: {
      kind: 'multiselect',
      label: bilingual('Cómo avisar', 'How to alert'),
      options: [option('email', 'Correo', 'Email'), option('whatsapp', 'WhatsApp', 'WhatsApp')],
    },
    backInStockEnabled: {
      kind: 'boolean',
      label: bilingual('Avisos de "vuelve a estar disponible"', '"Back in stock" notices'),
    },
  },
} satisfies { [G in StoreGroup]: GroupFields<G> };
