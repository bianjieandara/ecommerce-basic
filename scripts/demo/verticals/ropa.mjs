// Casa Mina: the catalogue of the clothing demo (clients/demo-ropa). A small Guadalajara workshop that sells on WhatsApp
// and now has a catalogue. Prices are Mexican pesos in minor units; stock and costs are made up but plausible, and two
// products are deliberately out of stock so the storefront's "sold out" and back-in-stock paths have something to show.

/** The store's own settings. Everything not named here comes from MEXICO_SETTINGS in to-sql.mjs. */
const settings = {
  general: { storeName: 'Casa Mina' },
  contact: {
    email: 'hola@casamina.mx',
    phone: '+52 33 0000 0000',
    whatsappNumber: '523300000000',
    whatsappMessage: {
      es: 'Hola, vi una prenda en la tienda y quiero preguntar por tallas.',
      en: 'Hi, I saw a piece in the shop and want to ask about sizes.',
    },
    showWhatsappFloat: true,
    address: 'Calle Libertad 100, Col. Americana, Guadalajara, Jal.',
    mapsEmbedUrl: '',
    openingHours: {
      es: 'Taller abierto de lunes a viernes, 10:00 a 18:00',
      en: 'Workshop open Monday to Friday, 10:00 to 18:00',
    },
    social: {},
  },
  checkout: {
    enabledMethods: ['dlocalgo', 'paypal', 'whatsapp', 'bank_transfer', 'cash_on_delivery'],
    bankTransferInstructions: {
      es: 'Transferencia SPEI a CLABE 000000000000000000, a nombre de Casa Mina. Manda el comprobante por WhatsApp.',
      en: 'SPEI transfer to CLABE 000000000000000000, in the name of Casa Mina. Send the receipt on WhatsApp.',
    },
    cashOnDeliveryNote: {
      es: 'Paga en efectivo al recibir, solo en Guadalajara y Zapopan.',
      en: 'Pay in cash on delivery, in Guadalajara and Zapopan only.',
    },
    onlineHoldMinutes: 45,
    manualAutoCancelDays: 3,
    paypalSettlementCurrency: null,
    paypalExchangeRate: null,
    orderNotificationEmail: 'pedidos@casamina.mx',
    whatsappOptInDefault: false,
  },
  invoicing: {
    enabled: true,
    autoIssue: 'on_paid',
    series: 'A',
    legalName: 'Casa Mina',
    // The generic RFC the SAT publishes for sales to the general public: it belongs to no real taxpayer.
    taxId: 'XAXX010101000',
    taxIdType: 'RFC',
    taxRegime: 'Régimen Simplificado de Confianza',
    address: 'Calle Libertad 100, Col. Americana, Guadalajara, Jal.',
    phone: '+52 33 0000 0000',
    email: 'facturacion@casamina.mx',
    footerNotes: {
      es: 'Gracias por comprar una pieza hecha en lotes cortos.',
      en: 'Thank you for buying a piece made in short runs.',
    },
    attachPdf: true,
    askBuyerTaxId: true,
    sendPdfByWhatsapp: true,
  },
};

/** Sizes letter and waist, plus the two colours one of the blouses comes in. */
const attributes = [
  {
    id: 'attr-size',
    code: 'size',
    name: { es: 'Talla', en: 'Size' },
    display: 'buttons',
    values: [
      { id: 'val-size-ch', code: 'ch', label: { es: 'CH', en: 'S' } },
      { id: 'val-size-m', code: 'm', label: { es: 'M', en: 'M' } },
      { id: 'val-size-g', code: 'g', label: { es: 'G', en: 'L' } },
    ],
  },
  {
    id: 'attr-waist',
    code: 'waist',
    name: { es: 'Talla de pantalón', en: 'Trouser size' },
    display: 'buttons',
    values: [
      { id: 'val-waist-26', code: '26', label: { es: '26', en: '26' } },
      { id: 'val-waist-28', code: '28', label: { es: '28', en: '28' } },
      { id: 'val-waist-30', code: '30', label: { es: '30', en: '30' } },
      { id: 'val-waist-32', code: '32', label: { es: '32', en: '32' } },
    ],
  },
  {
    id: 'attr-color',
    code: 'color',
    name: { es: 'Color', en: 'Colour' },
    display: 'swatches',
    values: [
      { id: 'val-color-arena', code: 'arena', label: { es: 'Arena', en: 'Sand' }, colorHex: '#d8cdb8' },
      { id: 'val-color-negro', code: 'negro', label: { es: 'Negro', en: 'Black' }, colorHex: '#1a1a18' },
    ],
  },
];

const categories = [
  {
    id: 'cat-blusas',
    name: { es: 'Blusas', en: 'Tops' },
    slug: { es: 'blusas', en: 'tops' },
    description: { es: 'Blusas y camisas en lino y manta', en: 'Linen and cotton tops and shirts' },
  },
  {
    id: 'cat-vestidos',
    name: { es: 'Vestidos', en: 'Dresses' },
    slug: { es: 'vestidos', en: 'dresses' },
    description: { es: 'Vestidos de diario, midi y camiseros', en: 'Everyday, midi and shirt dresses' },
  },
  {
    id: 'cat-pantalones',
    name: { es: 'Pantalones', en: 'Trousers' },
    slug: { es: 'pantalones', en: 'trousers' },
    description: { es: 'Mezclilla y lino, de la 26 a la 32', en: 'Denim and linen, sizes 26 to 32' },
  },
  {
    id: 'cat-accesorios',
    name: { es: 'Accesorios', en: 'Accessories' },
    slug: { es: 'accesorios', en: 'accessories' },
    description: { es: 'Latón, palma y telar de pedal', en: 'Brass, palm and pedal-loom weaving' },
  },
];

/**
 * Builds the size variants of a garment: one per letter size, with the same cost and a stock per size.
 * @param {string} base Id and SKU stem, for example "blusa-lino".
 * @param {number} costMinor What the piece costs the workshop.
 * @param {number[]} stock Stock for CH, M and G, in that order.
 * @returns {object[]} The variants.
 */
function letterSizes(base, costMinor, stock) {
  return ['ch', 'm', 'g'].map((size, index) => ({
    id: `var-${base}-${size}`,
    sku: `${base.toUpperCase().replace(/-/g, '')}-${size.toUpperCase()}`,
    costMinor,
    stock: stock[index],
    values: [`val-size-${size}`],
  }));
}

/**
 * Builds the waist variants of a trouser: one per waist size.
 * @param {string} base Id and SKU stem.
 * @param {number} costMinor What the piece costs the workshop.
 * @param {number[]} stock Stock for 26, 28, 30 and 32, in that order.
 * @returns {object[]} The variants.
 */
function waistSizes(base, costMinor, stock) {
  return ['26', '28', '30', '32'].map((waist, index) => ({
    id: `var-${base}-${waist}`,
    sku: `${base.toUpperCase().replace(/-/g, '')}-${waist}`,
    costMinor,
    stock: stock[index],
    values: [`val-waist-${waist}`],
  }));
}

const products = [
  {
    id: 'prod-blusa-lino',
    category: 'cat-blusas',
    priceMinor: 42000,
    featured: true,
    sales: 24,
    createdAt: '2026-09-02T10:00:00Z',
    name: { es: 'Blusa de lino', en: 'Linen blouse' },
    slug: { es: 'blusa-de-lino', en: 'linen-blouse' },
    short: { es: 'Lino lavado, corte holgado.', en: 'Washed linen, relaxed fit.' },
    body: {
      es: 'Blusa de lino lavado, de caída suelta y manga tres cuartos. El lino se ablanda con cada lavada y no pierde la forma.',
      en: 'A washed linen blouse with a loose drape and three-quarter sleeves. Linen softens with every wash and keeps its shape.',
    },
    // The one piece that comes in two colours, so the variant picker has something real to show.
    variants: ['arena', 'negro'].flatMap((color) =>
      ['ch', 'm', 'g'].map((size) => ({
        id: `var-blusa-lino-${size}-${color}`,
        sku: `BLULIN-${size.toUpperCase()}-${color.slice(0, 3).toUpperCase()}`,
        costMinor: 17000,
        stock: color === 'arena' ? { ch: 6, m: 9, g: 4 }[size] : { ch: 3, m: 0, g: 2 }[size],
        values: [`val-size-${size}`, `val-color-${color}`],
      })),
    ),
  },
  {
    id: 'prod-blusa-manta',
    category: 'cat-blusas',
    priceMinor: 38000,
    featured: false,
    sales: 11,
    createdAt: '2026-08-14T10:00:00Z',
    name: { es: 'Blusa de manta bordada', en: 'Embroidered cotton blouse' },
    slug: { es: 'blusa-de-manta-bordada', en: 'embroidered-cotton-blouse' },
    short: { es: 'Bordada a mano en el cuello.', en: 'Hand embroidery at the neck.' },
    body: {
      es: 'Manta de algodón con bordado hecho a mano en el cuello. Cada pieza lleva unas tres horas de bordado, así que no hay dos iguales.',
      en: 'Cotton cloth with hand embroidery at the neck. Each piece takes about three hours to embroider, so no two are alike.',
    },
    variants: letterSizes('blusa-manta', 15000, [4, 7, 5]),
  },
  {
    id: 'prod-camisa-popelina',
    category: 'cat-blusas',
    priceMinor: 52000,
    featured: false,
    sales: 6,
    createdAt: '2026-10-05T10:00:00Z',
    name: { es: 'Camisa de popelina', en: 'Poplin shirt' },
    slug: { es: 'camisa-de-popelina', en: 'poplin-shirt' },
    short: { es: 'Algodón peinado, puño doble.', en: 'Combed cotton, double cuff.' },
    body: {
      es: 'Camisa de popelina de algodón peinado, con puño doble y botones de concha. Plancha fácil y aguanta el uso diario.',
      en: 'A combed cotton poplin shirt with a double cuff and shell buttons. Easy to iron and made for daily wear.',
    },
    variants: letterSizes('camisa-popelina', 21000, [3, 5, 3]),
  },
  {
    id: 'prod-vestido-midi',
    category: 'cat-vestidos',
    priceMinor: 78000,
    featured: true,
    sales: 18,
    createdAt: '2026-09-20T10:00:00Z',
    name: { es: 'Vestido midi de lino', en: 'Linen midi dress' },
    slug: { es: 'vestido-midi-de-lino', en: 'linen-midi-dress' },
    short: { es: 'Largo a media pierna, con bolsas.', en: 'Mid-calf, with pockets.' },
    body: {
      es: 'Vestido de lino a media pierna, con bolsas laterales y cinturón del mismo tejido. Se usa solo en calor y con suéter en frío.',
      en: 'A mid-calf linen dress with side pockets and a belt in the same cloth. Wear it alone in the heat, with a jumper when it cools.',
    },
    variants: letterSizes('vestido-midi', 31000, [2, 4, 3]),
  },
  {
    id: 'prod-vestido-tirantes',
    category: 'cat-vestidos',
    priceMinor: 69000,
    compareAtMinor: 79000,
    featured: false,
    sales: 9,
    createdAt: '2026-07-11T10:00:00Z',
    name: { es: 'Vestido de tirantes', en: 'Strap dress' },
    slug: { es: 'vestido-de-tirantes', en: 'strap-dress' },
    short: { es: 'Última temporada, precio de salida.', en: 'Last season, reduced.' },
    body: {
      es: 'Vestido de tirantes ajustables en algodón ligero. Queda de la temporada pasada, por eso el precio.',
      en: 'A light cotton dress with adjustable straps. Left over from last season, which is why the price dropped.',
    },
    variants: letterSizes('vestido-tirantes', 28000, [1, 2, 0]),
  },
  {
    id: 'prod-vestido-camisero',
    category: 'cat-vestidos',
    priceMinor: 85000,
    featured: false,
    sales: 4,
    createdAt: '2026-10-12T10:00:00Z',
    name: { es: 'Vestido camisero', en: 'Shirt dress' },
    slug: { es: 'vestido-camisero', en: 'shirt-dress' },
    short: { es: 'Botones al frente, cinturón.', en: 'Button front, belted.' },
    body: {
      es: 'Vestido camisero de algodón, abotonado al frente y con cinturón. Sirve para la oficina y para el fin de semana.',
      en: 'A cotton shirt dress, buttoned at the front and belted. It works for the office and for the weekend.',
    },
    variants: letterSizes('vestido-camisero', 34000, [2, 3, 2]),
  },
  {
    id: 'prod-pantalon-recto',
    category: 'cat-pantalones',
    priceMinor: 65000,
    featured: true,
    sales: 21,
    createdAt: '2026-08-28T10:00:00Z',
    name: { es: 'Pantalón recto de mezclilla', en: 'Straight denim trousers' },
    slug: { es: 'pantalon-recto-de-mezclilla', en: 'straight-denim-trousers' },
    short: { es: 'Mezclilla rígida, tiro alto.', en: 'Rigid denim, high rise.' },
    body: {
      es: 'Mezclilla rígida de 12 onzas, tiro alto y pierna recta. No lleva elástico, así que se amolda con el uso.',
      en: '12 oz rigid denim, high rise, straight leg. No stretch, so it moulds to you as you wear it.',
    },
    variants: waistSizes('pantalon-recto', 26000, [5, 8, 6, 3]),
  },
  {
    id: 'prod-pantalon-lino',
    category: 'cat-pantalones',
    priceMinor: 59000,
    featured: false,
    sales: 13,
    createdAt: '2026-06-18T10:00:00Z',
    name: { es: 'Pantalón de lino', en: 'Linen trousers' },
    slug: { es: 'pantalon-de-lino', en: 'linen-trousers' },
    short: { es: 'Resorte en la cintura.', en: 'Elastic waist.' },
    body: {
      es: 'Pantalón de lino con resorte en la cintura y bolsas hondas. El más vendido del verano, por fresco.',
      en: 'Linen trousers with an elastic waist and deep pockets. Our summer best seller, because they breathe.',
    },
    variants: waistSizes('pantalon-lino', 23000, [4, 6, 0, 2]),
  },
  {
    id: 'prod-short-mezclilla',
    category: 'cat-pantalones',
    priceMinor: 45000,
    featured: false,
    sales: 7,
    createdAt: '2026-05-30T10:00:00Z',
    name: { es: 'Short de mezclilla', en: 'Denim shorts' },
    slug: { es: 'short-de-mezclilla', en: 'denim-shorts' },
    short: { es: 'Bastilla deshilada a mano.', en: 'Hand-frayed hem.' },
    body: {
      es: 'Short de mezclilla con la bastilla deshilada a mano, una por una. Tiro medio.',
      en: 'Denim shorts with the hem frayed by hand, one at a time. Mid rise.',
    },
    variants: waistSizes('short-mezclilla', 18000, [3, 4, 2, 1]),
  },
  {
    id: 'prod-aretes-laton',
    category: 'cat-accesorios',
    priceMinor: 18000,
    featured: false,
    sales: 32,
    createdAt: '2026-09-08T10:00:00Z',
    name: { es: 'Aretes de latón', en: 'Brass earrings' },
    slug: { es: 'aretes-de-laton', en: 'brass-earrings' },
    short: { es: 'Hechos a mano, poste de plata.', en: 'Handmade, silver posts.' },
    body: {
      es: 'Aretes de latón martillado a mano, con poste de plata .925 para que no irriten. Pesan poco, se pueden traer todo el día.',
      en: 'Hand-hammered brass earrings on .925 silver posts so they do not irritate. Light enough to wear all day.',
    },
    variants: [{ id: 'var-aretes-laton', sku: 'ARELAT-U', costMinor: 6000, stock: 18, values: [] }],
  },
  {
    id: 'prod-bolsa-palma',
    category: 'cat-accesorios',
    priceMinor: 54000,
    featured: true,
    sales: 15,
    createdAt: '2026-07-25T10:00:00Z',
    name: { es: 'Bolsa de palma', en: 'Palm bag' },
    slug: { es: 'bolsa-de-palma', en: 'palm-bag' },
    short: { es: 'Tejida en Oaxaca, asa de piel.', en: 'Woven in Oaxaca, leather handle.' },
    body: {
      es: 'Bolsa de palma tejida por una familia de Oaxaca, con asa de piel curtida con vegetales. Le caben una laptop de 13 pulgadas y el mandado.',
      en: 'A palm bag woven by a family in Oaxaca, with a vegetable-tanned leather handle. It holds a 13-inch laptop and the groceries.',
    },
    variants: [{ id: 'var-bolsa-palma', sku: 'BOLPAL-U', costMinor: 22000, stock: 9, values: [] }],
  },
  {
    id: 'prod-rebozo',
    category: 'cat-accesorios',
    priceMinor: 115000,
    featured: false,
    sales: 3,
    createdAt: '2026-04-16T10:00:00Z',
    name: { es: 'Rebozo tejido en telar', en: 'Loom-woven rebozo' },
    slug: { es: 'rebozo-tejido-en-telar', en: 'loom-woven-rebozo' },
    short: { es: 'Telar de pedal, dos semanas de trabajo.', en: 'Pedal loom, two weeks of work.' },
    body: {
      es: 'Rebozo de algodón tejido en telar de pedal. Cada pieza lleva unas dos semanas, con el rapacejo anudado a mano al final.',
      en: 'A cotton rebozo woven on a pedal loom. Each one takes about two weeks, with the fringe knotted by hand at the end.',
    },
    variants: [{ id: 'var-rebozo', sku: 'REB-U', costMinor: 52000, stock: 0, values: [] }],
  },
];

/** Text in both languages. */
const text = (es, en) => ({ es, en });

/** The look an owner would arrive at in Settings > Theme: warm paper, square corners, a clay accent. */
const theme = {
  colorPrimary: '#1B1A17',
  colorOnPrimary: '#FDFCF9',
  colorAccent: '#8F4324',
  colorBackground: '#FDFCF9',
  colorSurface: '#F1EEE7',
  colorText: '#1B1A17',
  fontPreset: 'manrope',
  radius: 'none',
};

/**
 * The home page of a shop that sells clothes: the look carries it, and the pieces of that look are bought from under it.
 * @param {string[]} hero Media ids of the hero pictures.
 * @returns {object[]} Sections as the page builder saves them.
 */
function home(hero) {
  return [
    {
      id: 'home-hero',
      type: 'hero_carousel',
      enabled: true,
      config: {
        // "scene" writes nothing over the photograph: the type sits in a solid block in the corner.
        layout: 'scene',
        autoplaySeconds: 7,
        slides: [
          {
            image: hero[0],
            title: text('Ropa de diario, bien hecha', 'Everyday clothes, properly made'),
            subtitle: text(
              'Tiradas de 30 piezas hechas en Guadalajara.',
              'Runs of 30 pieces, made in Guadalajara.',
            ),
            cta: { href: '/shop', label: text('Ver el catálogo', 'See the catalogue') },
          },
          {
            image: hero[1],
            title: text('Look de otoño', 'The autumn look'),
            subtitle: text('Blusa de lino y pantalón recto.', 'Linen blouse and straight trousers.'),
            cta: { href: '/shop', label: text('Ver las piezas', 'See the pieces') },
          },
        ],
      },
    },
    {
      id: 'home-look',
      type: 'featured_products',
      enabled: true,
      config: {
        title: text('Las piezas de este look', 'The pieces of this look'),
        source: 'featured',
        categoryIds: [],
        productIds: [],
        limit: 3,
        layout: 'list',
      },
    },
    {
      id: 'home-new',
      type: 'featured_products',
      enabled: true,
      config: {
        title: text('Lo nuevo', 'New in'),
        source: 'newest',
        categoryIds: [],
        productIds: [],
        limit: 8,
        // Not "grid": the default card brings back the tinted tile and the price pill, which is the one thing on this
        // page that would still read as a theme next to the scene hero and the quiet rows below it.
        layout: 'gallery',
      },
    },
    {
      id: 'home-categories',
      type: 'category_grid',
      enabled: true,
      config: { title: text('Qué hay', 'What there is'), categoryIds: [], layout: 'links' },
    },
    {
      id: 'home-badges',
      type: 'trust_badges',
      enabled: true,
      config: {
        layout: 'line',
        items: [
          { icon: 'truck', text: text('Envíos a todo México', 'Shipping across Mexico') },
          { icon: 'return', text: text('Cambios en 10 días', 'Exchanges within 10 days') },
          { icon: 'lock', text: text('Pago en OXXO o transferencia', 'Pay at OXXO or by transfer') },
          { icon: 'chat', text: text('Guadalajara, desde 2019', 'Guadalajara, since 2019') },
        ],
      },
    },
    {
      id: 'home-testimonials',
      type: 'testimonials',
      enabled: true,
      config: {
        title: text('Lo que nos escriben', 'What people write to us'),
        includeGoogle: false,
        includeManual: true,
        limit: 3,
        layout: 'quiet',
      },
    },
    {
      id: 'home-whatsapp',
      type: 'whatsapp_cta',
      enabled: true,
      config: {
        title: text('¿Dudas con la talla?', 'Unsure about the size?'),
        text: text(
          'Mándanos tus medidas y te decimos cuál pedir.',
          'Send us your measurements and we will tell you which to order.',
        ),
        buttonLabel: text('Escribir por WhatsApp', 'Chat on WhatsApp'),
        layout: 'line',
      },
    },
  ];
}

/** Opinions the store shows on its home page: author, rating, language and what they wrote. */
const testimonials = [
  [
    'Camila T.',
    5,
    'es',
    'Pedí la blusa de lino un martes y llegó el jueves. La tela es mejor de lo que esperaba.',
  ],
  ['Daniela R.', 5, 'es', 'No estaba mi talla y me la hicieron en diez días, sin cobrarme más.'],
  [
    'Sofía M.',
    4,
    'es',
    'El pantalón recto queda justo como en la foto. Me gustaría que hubiera más colores.',
  ],
];

/**
 * What every photograph of this store has in common. Garments are the hardest subject these models have: a blouse "worn"
 * comes back with one long sleeve and one short. Everything here is folded flat, stacked or on a hanger, which is also
 * how a small workshop photographs its own stock.
 */
const photoStyle =
  'on a plain warm beige paper backdrop, soft diffused daylight from the left, gentle shadow, centred, square composition, muted earth tones, calm minimal still life, shallow depth of field';

/** The subject of each picture. The key is the row it belongs to; `hero` is the banner, in order. */
const photos = {
  hero: [
    'a workshop table seen from above with folded linen garments, wooden thread spools, a tape measure and fabric scissors arranged across it',
    'folded linen clothes stacked in soft daylight on a pale wooden shelf',
  ],
  categories: {
    'cat-blusas': 'three folded linen and cotton blouses in a neat stack',
    'cat-vestidos': 'two linen dresses on plain wooden hangers against a pale wall',
    'cat-pantalones': 'folded denim and folded linen trousers in two neat stacks side by side',
    'cat-accesorios': 'hammered brass earrings, a woven palm bag and a folded shawl arranged together',
  },
  products: {
    'prod-blusa-lino': 'a neatly folded natural linen blouse resting on a pale linen cloth',
    'prod-blusa-manta': 'a folded cream cotton blouse with hand embroidery at the collar, laid flat',
    'prod-camisa-popelina': 'a crisply folded white cotton poplin shirt with shell buttons, laid flat',
    'prod-vestido-midi': 'a sand coloured linen dress draped on a plain wooden hanger against a pale wall',
    'prod-vestido-tirantes': 'a light cotton slip dress draped over the back of a wooden chair',
    'prod-vestido-camisero': 'a folded cotton shirt dress with its fabric belt coiled beside it',
    'prod-pantalon-recto': 'a pair of folded indigo denim trousers in a neat stack, the hem turned up',
    'prod-pantalon-lino': 'folded sand coloured linen trousers in a neat stack',
    'prod-short-mezclilla': 'folded denim shorts with a hand frayed hem, laid flat',
    'prod-aretes-laton': 'a pair of hammered brass earrings lying on a pale stone dish',
    'prod-bolsa-palma': 'a woven palm basket bag with a leather handle standing upright',
    'prod-rebozo': 'a handwoven cotton shawl folded with its knotted fringe spread out',
  },
};

export default {
  slug: 'demo-ropa',
  storeName: 'Casa Mina',
  photoStyle,
  photos,
  theme,
  home,
  testimonials,
  seoDescription: {
    es: 'Ropa de diario hecha en Guadalajara en tiradas de 30 piezas. Envíos a todo México y cambios en 10 días.',
    en: 'Everyday clothing made in Guadalajara in runs of 30. Shipping across Mexico, exchanges within 10 days.',
  },
  settings,
  attributes,
  categories,
  products,
};
