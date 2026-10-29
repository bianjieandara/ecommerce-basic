// Raíz: the catalogue of the skincare demo (clients/demo-skincare). A small cosmetics maker whose argument is that every
// ingredient is on the label. Prices are Mexican pesos in minor units. Sizes are the variant axis here, not clothing sizes,
// which is why this store declares its own attribute instead of reusing the clothing one.

/** The store's own settings. Everything not named here comes from MEXICO_SETTINGS in to-sql.mjs. */
const settings = {
  general: { storeName: 'Raíz' },
  contact: {
    email: 'hola@raiz.mx',
    phone: '+52 55 0000 0000',
    whatsappNumber: '525500000000',
    whatsappMessage: {
      es: 'Hola, quiero saber cuál producto me conviene para mi tipo de piel.',
      en: 'Hi, I would like to know which product suits my skin.',
    },
    showWhatsappFloat: true,
    address: 'Calle Córdoba 50, Col. Roma Norte, Ciudad de México',
    mapsEmbedUrl: '',
    openingHours: {
      es: 'Pedidos en línea todos los días; taller de lunes a jueves',
      en: 'Online orders every day; workshop Monday to Thursday',
    },
    social: {},
  },
  checkout: {
    enabledMethods: ['dlocalgo', 'paypal', 'whatsapp', 'bank_transfer'],
    bankTransferInstructions: {
      es: 'Transferencia SPEI a CLABE 000000000000000000, a nombre de Raíz. Manda el comprobante por WhatsApp.',
      en: 'SPEI transfer to CLABE 000000000000000000, in the name of Raíz. Send the receipt on WhatsApp.',
    },
    cashOnDeliveryNote: { es: '', en: '' },
    onlineHoldMinutes: 45,
    manualAutoCancelDays: 3,
    paypalSettlementCurrency: null,
    paypalExchangeRate: null,
    orderNotificationEmail: 'pedidos@raiz.mx',
    whatsappOptInDefault: false,
  },
  invoicing: {
    enabled: true,
    autoIssue: 'on_paid',
    series: 'A',
    legalName: 'Raíz',
    // The generic RFC the SAT publishes for sales to the general public: it belongs to no real taxpayer.
    taxId: 'XAXX010101000',
    taxIdType: 'RFC',
    taxRegime: 'Régimen Simplificado de Confianza',
    address: 'Calle Córdoba 50, Col. Roma Norte, Ciudad de México',
    phone: '+52 55 0000 0000',
    email: 'facturacion@raiz.mx',
    footerNotes: {
      es: 'Cada lote lleva su fecha de elaboración en la etiqueta.',
      en: 'Every batch carries its making date on the label.',
    },
    attachPdf: true,
    askBuyerTaxId: true,
    sendPdfByWhatsapp: true,
  },
};

/** The only axis that varies here: how much product is in the bottle. */
const attributes = [
  {
    id: 'attr-tamano',
    code: 'size',
    name: { es: 'Tamaño', en: 'Size' },
    display: 'buttons',
    values: [
      { id: 'val-tamano-30', code: '30ml', label: { es: '30 ml', en: '30 ml' } },
      { id: 'val-tamano-50', code: '50ml', label: { es: '50 ml', en: '50 ml' } },
      { id: 'val-tamano-100', code: '100ml', label: { es: '100 ml', en: '100 ml' } },
      { id: 'val-tamano-200', code: '200ml', label: { es: '200 ml', en: '200 ml' } },
    ],
  },
];

const categories = [
  {
    id: 'cat-rostro',
    name: { es: 'Rostro', en: 'Face' },
    slug: { es: 'rostro', en: 'face' },
    description: { es: 'Limpieza, tónico, aceite y crema', en: 'Cleanser, toner, oil and cream' },
  },
  {
    id: 'cat-cuerpo',
    name: { es: 'Cuerpo', en: 'Body' },
    slug: { es: 'cuerpo', en: 'body' },
    description: { es: 'Jabón, aceite y exfoliante', en: 'Soap, oil and scrub' },
  },
  {
    id: 'cat-labios',
    name: { es: 'Labios', en: 'Lips' },
    slug: { es: 'labios', en: 'lips' },
    description: { es: 'Bálsamos de cera de abeja y cacao', en: 'Beeswax and cocoa balms' },
  },
  {
    id: 'cat-kits',
    name: { es: 'Kits', en: 'Kits' },
    slug: { es: 'kits', en: 'kits' },
    description: { es: 'La rutina completa, más barata junta', en: 'The whole routine, cheaper together' },
  },
];

/**
 * Builds a single-size product's one variant.
 * @param {string} base Id and SKU stem.
 * @param {number} costMinor What the batch costs to make, per unit.
 * @param {number} stock Units on hand.
 * @returns {object[]} One variant without attribute values.
 */
function single(base, costMinor, stock) {
  return [
    { id: `var-${base}`, sku: `${base.toUpperCase().replace(/-/g, '')}-U`, costMinor, stock, values: [] },
  ];
}

const products = [
  {
    id: 'prod-aceite-rosa',
    category: 'cat-rostro',
    priceMinor: 32000,
    featured: true,
    sales: 41,
    createdAt: '2026-09-04T10:00:00Z',
    name: { es: 'Aceite de rosa mosqueta', en: 'Rosehip face oil' },
    slug: { es: 'aceite-de-rosa-mosqueta', en: 'rosehip-face-oil' },
    short: { es: 'Prensado en frío, un solo ingrediente.', en: 'Cold pressed, a single ingredient.' },
    body: {
      es: 'Aceite de rosa mosqueta prensado en frío, sin mezclar con nada más. Tres gotas en la noche, sobre la piel todavía húmeda.',
      en: 'Cold-pressed rosehip oil, mixed with nothing else. Three drops at night, on skin that is still damp.',
    },
    // The one product in two sizes, so the picker has something real to show.
    variants: [
      { id: 'var-aceite-rosa-30', sku: 'ACEROS-30', costMinor: 11000, stock: 14, values: ['val-tamano-30'] },
      { id: 'var-aceite-rosa-50', sku: 'ACEROS-50', costMinor: 17000, stock: 6, values: ['val-tamano-50'] },
    ],
  },
  {
    id: 'prod-tonico-manzanilla',
    category: 'cat-rostro',
    priceMinor: 24000,
    featured: false,
    sales: 27,
    createdAt: '2026-08-19T10:00:00Z',
    name: { es: 'Tónico de manzanilla', en: 'Chamomile toner' },
    slug: { es: 'tonico-de-manzanilla', en: 'chamomile-toner' },
    short: { es: 'Sin alcohol, para piel reactiva.', en: 'Alcohol free, for reactive skin.' },
    body: {
      es: 'Infusión de manzanilla y hamamelis, sin alcohol. Se aplica con algodón después de limpiar, mañana y noche.',
      en: 'An infusion of chamomile and witch hazel, with no alcohol. Apply with cotton after cleansing, morning and night.',
    },
    variants: [
      { id: 'var-tonico-100', sku: 'TONMAN-100', costMinor: 8000, stock: 22, values: ['val-tamano-100'] },
    ],
  },
  {
    id: 'prod-crema-nopal',
    category: 'cat-rostro',
    priceMinor: 39000,
    featured: true,
    sales: 19,
    createdAt: '2026-10-02T10:00:00Z',
    name: { es: 'Crema de nopal', en: 'Nopal cream' },
    slug: { es: 'crema-de-nopal', en: 'nopal-cream' },
    short: { es: 'Hidrata sin dejar la cara grasosa.', en: 'Hydrates without leaving skin greasy.' },
    body: {
      es: 'Crema ligera de nopal y aceite de jojoba. Hidrata sin brillo, así que sirve de base para el maquillaje.',
      en: 'A light cream of nopal and jojoba oil. It hydrates without shine, so it works under makeup.',
    },
    variants: [
      { id: 'var-crema-nopal-50', sku: 'CRENOP-50', costMinor: 14000, stock: 11, values: ['val-tamano-50'] },
    ],
  },
  {
    id: 'prod-limpiador-avena',
    category: 'cat-rostro',
    priceMinor: 28000,
    featured: false,
    sales: 15,
    createdAt: '2026-07-08T10:00:00Z',
    name: { es: 'Limpiador de avena', en: 'Oat cleanser' },
    slug: { es: 'limpiador-de-avena', en: 'oat-cleanser' },
    short: { es: 'No reseca, no hace espuma.', en: 'No drying, no foam.' },
    body: {
      es: 'Limpiador cremoso de avena coloidal. No hace espuma, que es justo lo que deja la cara tirante.',
      en: 'A creamy colloidal oat cleanser. It does not foam, which is what leaves skin tight.',
    },
    variants: [
      { id: 'var-limpiador-150', sku: 'LIMAVE-150', costMinor: 9000, stock: 0, values: ['val-tamano-100'] },
    ],
  },
  {
    id: 'prod-jabon-avena',
    category: 'cat-cuerpo',
    priceMinor: 9500,
    featured: false,
    sales: 63,
    createdAt: '2026-06-12T10:00:00Z',
    name: { es: 'Jabón de avena y miel', en: 'Oat and honey soap' },
    slug: { es: 'jabon-de-avena-y-miel', en: 'oat-and-honey-soap' },
    short: { es: 'Saponificado en frío, 90 g.', en: 'Cold saponified, 90 g.' },
    body: {
      es: 'Jabón saponificado en frío con avena molida y miel de Cuetzalan. Cura seis semanas antes de salir a la venta.',
      en: 'Cold-saponified soap with ground oats and honey from Cuetzalan. It cures for six weeks before going on sale.',
    },
    variants: single('jabon-avena', 3200, 48),
  },
  {
    id: 'prod-aceite-almendra',
    category: 'cat-cuerpo',
    priceMinor: 31000,
    featured: false,
    sales: 22,
    createdAt: '2026-09-26T10:00:00Z',
    name: { es: 'Aceite corporal de almendra', en: 'Almond body oil' },
    slug: { es: 'aceite-corporal-de-almendra', en: 'almond-body-oil' },
    short: { es: 'Con lavanda, para después del baño.', en: 'With lavender, for after the shower.' },
    body: {
      es: 'Aceite de almendra dulce con unas gotas de lavanda. Se pone con la piel húmeda, al salir de bañarse.',
      en: 'Sweet almond oil with a few drops of lavender. Apply to damp skin, straight out of the shower.',
    },
    variants: [
      {
        id: 'var-aceite-almendra-100',
        sku: 'ACEALM-100',
        costMinor: 12000,
        stock: 9,
        values: ['val-tamano-100'],
      },
    ],
  },
  {
    id: 'prod-exfoliante-cafe',
    category: 'cat-cuerpo',
    priceMinor: 26000,
    compareAtMinor: 31000,
    featured: false,
    sales: 18,
    createdAt: '2026-05-21T10:00:00Z',
    name: { es: 'Exfoliante de café', en: 'Coffee scrub' },
    slug: { es: 'exfoliante-de-cafe', en: 'coffee-scrub' },
    short: { es: 'Café de Veracruz, precio de salida.', en: 'Veracruz coffee, reduced.' },
    body: {
      es: 'Exfoliante de café molido de Veracruz con azúcar y aceite de coco. Se acaba el lote, por eso el precio.',
      en: 'A scrub of ground Veracruz coffee with sugar and coconut oil. The batch is ending, which is why the price dropped.',
    },
    variants: [
      { id: 'var-exfoliante-200', sku: 'EXFCAF-200', costMinor: 9000, stock: 4, values: ['val-tamano-200'] },
    ],
  },
  {
    id: 'prod-balsamo-labios',
    category: 'cat-labios',
    priceMinor: 8500,
    featured: false,
    sales: 87,
    createdAt: '2026-04-30T10:00:00Z',
    name: { es: 'Bálsamo de labios', en: 'Lip balm' },
    slug: { es: 'balsamo-de-labios', en: 'lip-balm' },
    short: { es: 'Cera de abeja, sin sabor.', en: 'Beeswax, unflavoured.' },
    body: {
      es: 'Bálsamo de cera de abeja y aceite de ricino, sin sabor ni color. El más vendido, y el más barato de probar.',
      en: 'A balm of beeswax and castor oil, with no flavour or colour. Our best seller, and the cheapest thing to try.',
    },
    variants: single('balsamo-labios', 2800, 64),
  },
  {
    id: 'prod-manteca-cacao',
    category: 'cat-labios',
    priceMinor: 11000,
    featured: false,
    sales: 34,
    createdAt: '2026-08-02T10:00:00Z',
    name: { es: 'Manteca de cacao', en: 'Cocoa butter balm' },
    slug: { es: 'manteca-de-cacao', en: 'cocoa-butter-balm' },
    short: { es: 'Cacao de Tabasco, huele a chocolate.', en: 'Tabasco cocoa, smells of chocolate.' },
    body: {
      es: 'Manteca de cacao de Tabasco sin refinar, por eso huele a chocolate. Sirve igual para labios y para cutículas.',
      en: 'Unrefined cocoa butter from Tabasco, which is why it smells of chocolate. Works on lips and cuticles alike.',
    },
    variants: single('manteca-cacao', 3600, 27),
  },
  {
    id: 'prod-kit-esencial',
    category: 'cat-kits',
    priceMinor: 65000,
    compareAtMinor: 75000,
    featured: true,
    sales: 29,
    createdAt: '2026-09-15T10:00:00Z',
    name: { es: 'Kit rutina esencial', en: 'Essential routine kit' },
    slug: { es: 'kit-rutina-esencial', en: 'essential-routine-kit' },
    short: { es: 'Limpiador, tónico y aceite.', en: 'Cleanser, toner and oil.' },
    body: {
      es: 'Los tres pasos que de verdad hacen falta: limpiador de avena, tónico de manzanilla y aceite de rosa mosqueta de 30 ml.',
      en: 'The three steps that actually matter: oat cleanser, chamomile toner and the 30 ml rosehip oil.',
    },
    variants: single('kit-esencial', 29000, 7),
  },
  {
    id: 'prod-kit-viaje',
    category: 'cat-kits',
    priceMinor: 42000,
    featured: false,
    sales: 12,
    createdAt: '2026-10-10T10:00:00Z',
    name: { es: 'Kit de viaje', en: 'Travel kit' },
    slug: { es: 'kit-de-viaje', en: 'travel-kit' },
    short: { es: 'Tamaños de mano, en bolsa de algodón.', en: 'Carry-on sizes, in a cotton pouch.' },
    body: {
      es: 'Versiones chicas de los cuatro básicos, todas por debajo de 100 ml, en una bolsa de algodón que se lava.',
      en: 'Small versions of the four basics, all under 100 ml, in a washable cotton pouch.',
    },
    variants: single('kit-viaje', 18000, 10),
  },
  {
    id: 'prod-kit-regalo',
    category: 'cat-kits',
    priceMinor: 78000,
    featured: false,
    sales: 5,
    createdAt: '2026-10-20T10:00:00Z',
    name: { es: 'Kit de regalo', en: 'Gift kit' },
    slug: { es: 'kit-de-regalo', en: 'gift-kit' },
    short: { es: 'Envuelto en papel, con nota a mano.', en: 'Paper wrapped, handwritten note.' },
    body: {
      es: 'Cinco productos envueltos en papel de estraza, con una nota escrita a mano. Dinos qué poner en la nota al pagar.',
      en: 'Five products wrapped in kraft paper with a handwritten note. Tell us what it should say at checkout.',
    },
    variants: single('kit-regalo', 34000, 0),
  },
];

export default {
  slug: 'demo-skincare',
  storeName: 'Raíz',
  seoDescription: {
    es: 'Cosmética natural hecha en lotes de 40 piezas, con todos los ingredientes en la etiqueta. Envíos a todo México.',
    en: 'Natural skincare made in batches of 40, with every ingredient on the label. Shipping across Mexico.',
  },
  settings,
  attributes,
  categories,
  products,
};
