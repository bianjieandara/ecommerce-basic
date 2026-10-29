// Comal: the catalogue of the packaged-food demo (clients/demo-despensa). Coffee, salsas and preserves that travel, bought
// from named producers. Packaged food, not cooked food: this template ships flat or is picked up, with no delivery zones or
// time windows, so a kitchen selling the day's meal would be shown a store it cannot run.

/** The store's own settings. Everything not named here comes from MEXICO_SETTINGS in to-sql.mjs. */
const settings = {
  general: { storeName: 'Comal' },
  contact: {
    email: 'hola@comal.mx',
    phone: '+52 228 000 0000',
    whatsappNumber: '522280000000',
    whatsappMessage: {
      es: 'Hola, quiero preguntar por el café y cuándo sale el siguiente tueste.',
      en: 'Hi, I want to ask about the coffee and the next roast.',
    },
    showWhatsappFloat: true,
    address: 'Calle Xalapeños Ilustres 200, Xalapa, Ver.',
    mapsEmbedUrl: '',
    openingHours: {
      es: 'Tostamos los martes; los pedidos de ese día salen el miércoles',
      en: 'We roast on Tuesdays; that day’s orders ship on Wednesday',
    },
    social: {},
  },
  checkout: {
    enabledMethods: ['dlocalgo', 'paypal', 'whatsapp', 'bank_transfer', 'cash_on_delivery'],
    bankTransferInstructions: {
      es: 'Transferencia SPEI a CLABE 000000000000000000, a nombre de Comal. Manda el comprobante por WhatsApp.',
      en: 'SPEI transfer to CLABE 000000000000000000, in the name of Comal. Send the receipt on WhatsApp.',
    },
    cashOnDeliveryNote: {
      es: 'Paga en efectivo al recibir, solo en Xalapa y Coatepec.',
      en: 'Pay in cash on delivery, in Xalapa and Coatepec only.',
    },
    onlineHoldMinutes: 45,
    manualAutoCancelDays: 2,
    paypalSettlementCurrency: null,
    paypalExchangeRate: null,
    orderNotificationEmail: 'pedidos@comal.mx',
    whatsappOptInDefault: false,
  },
  invoicing: {
    enabled: true,
    autoIssue: 'on_paid',
    series: 'A',
    legalName: 'Comal',
    // The generic RFC the SAT publishes for sales to the general public: it belongs to no real taxpayer.
    taxId: 'XAXX010101000',
    taxIdType: 'RFC',
    taxRegime: 'Régimen Simplificado de Confianza',
    address: 'Calle Xalapeños Ilustres 200, Xalapa, Ver.',
    phone: '+52 228 000 0000',
    email: 'facturacion@comal.mx',
    footerNotes: {
      es: 'Cada frasco lleva su lote y su fecha de envasado.',
      en: 'Every jar carries its batch and packing date.',
    },
    attachPdf: true,
    askBuyerTaxId: true,
    sendPdfByWhatsapp: true,
  },
};

/** Coffee is sold whole or ground, and two staples come in two weights. */
const attributes = [
  {
    id: 'attr-molido',
    code: 'grind',
    name: { es: 'Molienda', en: 'Grind' },
    display: 'buttons',
    values: [
      { id: 'val-molido-grano', code: 'grano', label: { es: 'En grano', en: 'Whole bean' } },
      { id: 'val-molido-fino', code: 'fino', label: { es: 'Molido fino', en: 'Fine ground' } },
      { id: 'val-molido-medio', code: 'medio', label: { es: 'Molido medio', en: 'Medium ground' } },
    ],
  },
  {
    id: 'attr-peso',
    code: 'weight',
    name: { es: 'Peso', en: 'Weight' },
    display: 'buttons',
    values: [
      { id: 'val-peso-250', code: '250g', label: { es: '250 g', en: '250 g' } },
      { id: 'val-peso-500', code: '500g', label: { es: '500 g', en: '500 g' } },
      { id: 'val-peso-1k', code: '1kg', label: { es: '1 kg', en: '1 kg' } },
    ],
  },
];

const categories = [
  {
    id: 'cat-cafe',
    name: { es: 'Café', en: 'Coffee' },
    slug: { es: 'cafe', en: 'coffee' },
    description: { es: 'Tostado los martes en Xalapa', en: 'Roasted on Tuesdays in Xalapa' },
  },
  {
    id: 'cat-salsas',
    name: { es: 'Salsas', en: 'Salsas' },
    slug: { es: 'salsas', en: 'salsas' },
    description: { es: 'Macha, morita y mole en pasta', en: 'Macha, morita and mole paste' },
  },
  {
    id: 'cat-dulce',
    name: { es: 'Dulce', en: 'Sweet' },
    slug: { es: 'dulce', en: 'sweet' },
    description: { es: 'Miel, mermelada y cajeta', en: 'Honey, jam and cajeta' },
  },
  {
    id: 'cat-despensa',
    name: { es: 'Despensa', en: 'Pantry' },
    slug: { es: 'despensa', en: 'pantry' },
    description: { es: 'Frijol, pinole y vainilla', en: 'Beans, pinole and vanilla' },
  },
];

/**
 * Builds a single-format product's one variant.
 * @param {string} base Id and SKU stem.
 * @param {number} costMinor What the jar costs Comal from the producer.
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
    id: 'prod-cafe-altura',
    category: 'cat-cafe',
    priceMinor: 23000,
    featured: true,
    sales: 54,
    createdAt: '2026-10-06T10:00:00Z',
    name: { es: 'Café de altura de Coatepec', en: 'Coatepec highland coffee' },
    slug: { es: 'cafe-de-altura-de-coatepec', en: 'coatepec-highland-coffee' },
    short: { es: '340 g, tueste medio, de don Refugio.', en: '340 g, medium roast, from don Refugio.' },
    body: {
      es: 'Arábica de altura de la finca de don Refugio Hernández, en Coatepec. Tueste medio, tostado el martes anterior al envío.',
      en: 'Highland arabica from don Refugio Hernández’s farm in Coatepec. Medium roast, roasted the Tuesday before it ships.',
    },
    // The one product with a real choice to make: how it is ground.
    variants: [
      {
        id: 'var-cafe-altura-grano',
        sku: 'CAFALT-GRA',
        costMinor: 11000,
        stock: 26,
        values: ['val-molido-grano'],
      },
      {
        id: 'var-cafe-altura-fino',
        sku: 'CAFALT-FIN',
        costMinor: 11000,
        stock: 12,
        values: ['val-molido-fino'],
      },
      {
        id: 'var-cafe-altura-medio',
        sku: 'CAFALT-MED',
        costMinor: 11000,
        stock: 18,
        values: ['val-molido-medio'],
      },
    ],
  },
  {
    id: 'prod-cafe-olla',
    category: 'cat-cafe',
    priceMinor: 16000,
    featured: false,
    sales: 31,
    createdAt: '2026-08-22T10:00:00Z',
    name: { es: 'Café de olla molido', en: 'Café de olla, ground' },
    slug: { es: 'cafe-de-olla-molido', en: 'cafe-de-olla-ground' },
    short: { es: '500 g, con canela molida.', en: '500 g, with ground cinnamon.' },
    body: {
      es: 'Mezcla para café de olla, con canela ya molida. Una cucharada por taza, con piloncillo al gusto.',
      en: 'A café de olla blend with the cinnamon already ground. One spoon per cup, with piloncillo to taste.',
    },
    variants: [
      { id: 'var-cafe-olla-500', sku: 'CAFOLL-500', costMinor: 7000, stock: 20, values: ['val-peso-500'] },
    ],
  },
  {
    id: 'prod-cafe-descafeinado',
    category: 'cat-cafe',
    priceMinor: 26000,
    featured: false,
    sales: 8,
    createdAt: '2026-09-30T10:00:00Z',
    name: { es: 'Descafeinado al agua', en: 'Water-process decaf' },
    slug: { es: 'descafeinado-al-agua', en: 'water-process-decaf' },
    short: { es: '250 g, sin disolventes.', en: '250 g, no solvents.' },
    body: {
      es: 'Descafeinado por el método de agua, sin disolventes químicos. Sabe a café, que es lo raro en un descafeinado.',
      en: 'Decaffeinated by the water process, with no chemical solvents. It tastes of coffee, which is the rare part.',
    },
    variants: [
      { id: 'var-cafe-desc-250', sku: 'CAFDES-250', costMinor: 13000, stock: 7, values: ['val-peso-250'] },
    ],
  },
  {
    id: 'prod-salsa-macha',
    category: 'cat-salsas',
    priceMinor: 12000,
    featured: true,
    sales: 76,
    createdAt: '2026-09-11T10:00:00Z',
    name: { es: 'Salsa macha', en: 'Salsa macha' },
    slug: { es: 'salsa-macha', en: 'salsa-macha' },
    short: { es: '200 g, con cacahuate y ajonjolí.', en: '200 g, with peanut and sesame.' },
    body: {
      es: 'Chile morita y de árbol en aceite, con cacahuate y ajonjolí. Pica, pero deja probar la comida.',
      en: 'Morita and árbol chillies in oil, with peanut and sesame. It bites, but lets you still taste the food.',
    },
    variants: single('salsa-macha', 4500, 38),
  },
  {
    id: 'prod-salsa-morita',
    category: 'cat-salsas',
    priceMinor: 11000,
    featured: false,
    sales: 44,
    createdAt: '2026-07-19T10:00:00Z',
    name: { es: 'Salsa de chile morita', en: 'Morita chilli salsa' },
    slug: { es: 'salsa-de-chile-morita', en: 'morita-chilli-salsa' },
    short: { es: '200 g, ahumada, pica medio.', en: '200 g, smoky, medium heat.' },
    body: {
      es: 'Morita tatemado con tomate y ajo. Ahumada y de picor medio; la que más se repite en los pedidos.',
      en: 'Charred morita with tomato and garlic. Smoky, medium heat, and the one that comes back most in reorders.',
    },
    variants: single('salsa-morita', 4000, 29),
  },
  {
    id: 'prod-mole-pasta',
    category: 'cat-salsas',
    priceMinor: 18000,
    featured: false,
    sales: 23,
    createdAt: '2026-06-25T10:00:00Z',
    name: { es: 'Mole en pasta', en: 'Mole paste' },
    slug: { es: 'mole-en-pasta', en: 'mole-paste' },
    short: { es: '250 g de Oaxaca, rinde 8 porciones.', en: '250 g from Oaxaca, serves 8.' },
    body: {
      es: 'Pasta de mole negro de una familia de Oaxaca. Se disuelve en caldo: 250 g rinden para unas ocho porciones.',
      en: 'Black mole paste from a family in Oaxaca. Dissolve it in stock: 250 g serves about eight.',
    },
    variants: single('mole-pasta', 7500, 0),
  },
  {
    id: 'prod-miel-abeja',
    category: 'cat-dulce',
    priceMinor: 16000,
    featured: true,
    sales: 51,
    createdAt: '2026-08-07T10:00:00Z',
    name: { es: 'Miel de abeja de Cuetzalan', en: 'Cuetzalan honey' },
    slug: { es: 'miel-de-abeja-de-cuetzalan', en: 'cuetzalan-honey' },
    short: { es: 'Cruda, se cristaliza y está bien.', en: 'Raw; it crystallises, and that is fine.' },
    body: {
      es: 'Miel cruda de la sierra de Puebla, sin filtrar ni calentar. Se cristaliza con el frío: eso prueba que es miel de verdad.',
      en: 'Raw honey from the Puebla highlands, unfiltered and unheated. It crystallises in the cold, which is how you know it is real.',
    },
    variants: [
      { id: 'var-miel-500', sku: 'MIEABE-500', costMinor: 7000, stock: 24, values: ['val-peso-500'] },
      { id: 'var-miel-1k', sku: 'MIEABE-1K', costMinor: 13000, stock: 9, values: ['val-peso-1k'] },
    ],
  },
  {
    id: 'prod-mermelada-higo',
    category: 'cat-dulce',
    priceMinor: 9500,
    featured: false,
    sales: 17,
    createdAt: '2026-05-14T10:00:00Z',
    name: { es: 'Mermelada de higo', en: 'Fig jam' },
    slug: { es: 'mermelada-de-higo', en: 'fig-jam' },
    short: { es: '280 g, poca azúcar.', en: '280 g, low sugar.' },
    body: {
      es: 'Higo de temporada con la mitad del azúcar de una mermelada común. Por eso dura menos abierta: tres semanas en frío.',
      en: 'Seasonal figs with half the sugar of an ordinary jam. That is why it keeps less once open: three weeks refrigerated.',
    },
    variants: single('mermelada-higo', 3500, 16),
  },
  {
    id: 'prod-cajeta',
    category: 'cat-dulce',
    priceMinor: 13000,
    compareAtMinor: 15000,
    featured: false,
    sales: 26,
    createdAt: '2026-04-09T10:00:00Z',
    name: { es: 'Cajeta de Celaya', en: 'Cajeta from Celaya' },
    slug: { es: 'cajeta-de-celaya', en: 'cajeta-from-celaya' },
    short: { es: '300 g de leche de cabra, quemada.', en: '300 g goat milk, burnt style.' },
    body: {
      es: 'Cajeta quemada de leche de cabra, hecha en cazo de cobre. Se acaba el lote de este productor, por eso el precio.',
      en: 'Burnt goat-milk cajeta made in a copper pot. This producer’s batch is ending, which is why the price dropped.',
    },
    variants: single('cajeta', 5500, 11),
  },
  {
    id: 'prod-frijol-bayo',
    category: 'cat-despensa',
    priceMinor: 8500,
    featured: false,
    sales: 39,
    createdAt: '2026-07-02T10:00:00Z',
    name: { es: 'Frijol bayo', en: 'Bayo beans' },
    slug: { es: 'frijol-bayo', en: 'bayo-beans' },
    short: { es: '1 kg de la cosecha de este año.', en: '1 kg from this year’s harvest.' },
    body: {
      es: 'Frijol bayo de temporal, de la cosecha de este año. El frijol viejo no se ablanda; por eso decimos de cuándo es.',
      en: 'Rain-fed bayo beans from this year’s harvest. Old beans never soften, which is why we say when they were picked.',
    },
    variants: [
      { id: 'var-frijol-1k', sku: 'FRIBAY-1K', costMinor: 4000, stock: 42, values: ['val-peso-1k'] },
    ],
  },
  {
    id: 'prod-pinole',
    category: 'cat-despensa',
    priceMinor: 9000,
    featured: false,
    sales: 12,
    createdAt: '2026-09-18T10:00:00Z',
    name: { es: 'Pinole', en: 'Pinole' },
    slug: { es: 'pinole', en: 'pinole' },
    short: { es: '400 g de maíz tostado con canela.', en: '400 g toasted maize with cinnamon.' },
    body: {
      es: 'Maíz criollo tostado y molido con canela. Se toma con agua o leche, o se le pone al atole.',
      en: 'Native maize, toasted and ground with cinnamon. Drink it with water or milk, or stir it into atole.',
    },
    variants: single('pinole', 3500, 19),
  },
  {
    id: 'prod-vainilla',
    category: 'cat-despensa',
    priceMinor: 24000,
    featured: false,
    sales: 6,
    createdAt: '2026-10-14T10:00:00Z',
    name: { es: 'Extracto de vainilla de Papantla', en: 'Papantla vanilla extract' },
    slug: { es: 'extracto-de-vainilla-de-papantla', en: 'papantla-vanilla-extract' },
    short: { es: '60 ml, de vaina, no de vainillina.', en: '60 ml, from pods, not vanillin.' },
    body: {
      es: 'Extracto hecho con vaina de Papantla macerada en alcohol de caña, nueve meses. Nada de vainillina de laboratorio.',
      en: 'Extract made from Papantla pods macerated in cane alcohol for nine months. No laboratory vanillin.',
    },
    variants: single('vainilla', 11000, 5),
  },
];

export default {
  slug: 'demo-despensa',
  storeName: 'Comal',
  seoDescription: {
    es: 'Café, salsas y conservas de productores con nombre, en Veracruz, Oaxaca y Puebla. Envíos a todo México.',
    en: 'Coffee, salsas and preserves from named producers in Veracruz, Oaxaca and Puebla. Shipping across Mexico.',
  },
  settings,
  attributes,
  categories,
  products,
};
