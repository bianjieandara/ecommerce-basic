// Turns one vertical's catalogue module into seed SQL, in the same shape and order as db/seed/dev.sql. The demos differ in
// what they sell, not in how a store is built, so the catalogue is written once as data and this module is the only place
// that knows SQL. Money is in integer minor units throughout, as everywhere else in this repository.

/** Settings every Mexican demo shares. A vertical overrides only the groups that describe its own business. */
export const MEXICO_SETTINGS = {
  general: {
    storeName: '',
    logoMediaId: null,
    faviconMediaId: null,
    defaultLocale: 'es',
    currency: 'MXN',
    country: 'MX',
    timezone: 'America/Mexico_City',
  },
  tax: {
    pricesIncludeTax: true,
    defaultRateBp: 1600,
    label: { es: 'IVA', en: 'VAT' },
    taxShipping: false,
    showBreakdown: true,
  },
  catalog: {
    pageSize: 24,
    newDays: 30,
    defaultSort: 'featured',
    showOutOfStock: 'last',
    showStockOnProduct: 'low',
    lowStockDisplayThreshold: 5,
  },
  inventory: {
    defaultLowStockThreshold: 3,
    lowStockAlerts: true,
    lowStockAlertChannels: ['email', 'whatsapp'],
    backInStockEnabled: true,
  },
};

/** Shipping every Mexican demo shares: a flat national rate that is free over a threshold, and free pickup. */
export const MEXICO_SHIPPING = [
  {
    id: 'ship-flat',
    kind: 'flat',
    name: { es: 'Envío estándar', en: 'Standard shipping' },
    description: { es: 'Entrega en 2 a 5 días hábiles', en: 'Delivered in 2 to 5 business days' },
    priceMinor: 9900,
    freeOverMinor: 99900,
  },
  {
    id: 'ship-pickup',
    kind: 'pickup',
    name: { es: 'Recoger en el taller', en: 'Workshop pickup' },
    description: { es: 'Sin costo, de lunes a viernes', en: 'Free, Monday to Friday' },
    priceMinor: 0,
    freeOverMinor: null,
  },
];

/** The timestamp every seeded row is created at, so a rebuilt demo is byte-identical to the last one. */
const SEEDED_AT = '2026-10-01T00:00:00Z';

/**
 * Quotes a value for SQL: a string is escaped and quoted, null becomes NULL, a number is written as it is.
 * @param {unknown} value Value to write.
 * @returns {string} SQL literal.
 */
function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Quotes a JSON value as a SQL string literal.
 * @param {unknown} value Value to serialise.
 * @returns {string} SQL literal holding JSON.
 */
function jsonLiteral(value) {
  return literal(JSON.stringify(value));
}

/**
 * Writes one INSERT statement, or an empty string when there is nothing to insert.
 * @param {string} table Table name.
 * @param {string} columns Column list, already parenthesised content.
 * @param {string[]} tuples Each row's values, already parenthesised content.
 * @returns {string} The statement, or ''.
 */
function insert(table, columns, tuples) {
  if (tuples.length === 0) return '';
  return `INSERT INTO ${table} (${columns}) VALUES\n${tuples.map((tuple) => `(${tuple})`).join(',\n')};\n`;
}

/**
 * Both languages of a localized field, as rows of (…, locale, …).
 * @param {{ es: string, en: string }} text Localized text.
 * @returns {['es'|'en', string][]} Locale and value pairs.
 */
function perLocale(text) {
  return [
    ['es', text.es],
    ['en', text.en],
  ];
}

/**
 * Builds the seed SQL for one vertical.
 * @param {object} vertical The catalogue module: settings overrides, attributes, categories, products and shipping.
 * @returns {string} SQL ready for `wrangler d1 execute --file`.
 */
export function verticalToSql(vertical) {
  const settings = { ...MEXICO_SETTINGS, ...vertical.settings };
  settings.general = { ...MEXICO_SETTINGS.general, ...vertical.settings.general };
  // Without a saved seo group every page but the home reads "… | Tienda": the shipped default template says that literally
  // (seoSettings in settings-schemas.ts), not the store's name. Deriving it here means no demo can forget it.
  settings.seo = {
    titleTemplate: {
      es: `%s | ${vertical.storeName}`,
      en: `%s | ${vertical.storeName}`,
    },
    defaultDescription: vertical.seoDescription,
    ogImageMediaId: null,
    ...vertical.settings.seo,
  };
  const shipping = vertical.shipping ?? MEXICO_SHIPPING;
  const parts = [
    `-- ${vertical.storeName}: the catalogue of the "${vertical.slug}" demo store.`,
    `-- Generated from scripts/demo/verticals/${vertical.slug.replace(/^demo-/, '')}.mjs; edit that module, never this file.`,
    '',
  ];

  parts.push(
    insert(
      'settings',
      'group_key, value_json, updated_at',
      Object.entries(settings).map(
        ([group, value]) => `${literal(group)}, ${jsonLiteral(value)}, ${literal(SEEDED_AT)}`,
      ),
    ),
  );

  parts.push(
    insert(
      'attributes',
      'id, code, name_json, display, is_filterable, position',
      vertical.attributes.map(
        (attribute, index) =>
          `${literal(attribute.id)}, ${literal(attribute.code)}, ${jsonLiteral(attribute.name)}, ` +
          `${literal(attribute.display)}, 1, ${index + 1}`,
      ),
    ),
  );

  parts.push(
    insert(
      'attribute_values',
      'id, attribute_id, code, label_json, color_hex, position',
      vertical.attributes.flatMap((attribute) =>
        attribute.values.map(
          (value, index) =>
            `${literal(value.id)}, ${literal(attribute.id)}, ${literal(value.code)}, ` +
            `${jsonLiteral(value.label)}, ${literal(value.colorHex ?? null)}, ${index + 1}`,
        ),
      ),
    ),
  );

  parts.push(
    insert(
      'categories',
      'id, parent_id, image_media_id, position, is_active, created_at, updated_at',
      vertical.categories.map(
        (category, index) =>
          `${literal(category.id)}, NULL, NULL, ${index + 1}, 1, ${literal(SEEDED_AT)}, ${literal(SEEDED_AT)}`,
      ),
    ),
  );

  parts.push(
    insert(
      'category_translations',
      'category_id, locale, name, slug, description',
      vertical.categories.flatMap((category) =>
        perLocale(category.name).map(
          ([locale, name]) =>
            `${literal(category.id)}, ${literal(locale)}, ${literal(name)}, ` +
            `${literal(category.slug[locale])}, ${literal(category.description[locale])}`,
        ),
      ),
    ),
  );

  parts.push(
    insert(
      'products',
      'id, status, base_price_minor, compare_at_price_minor, tax_rate_bp, min_price_minor, max_price_minor, ' +
        'is_on_sale, is_featured, sales_count, created_at, updated_at',
      vertical.products.map((product) => {
        const compare = product.compareAtMinor ?? null;
        return (
          `${literal(product.id)}, 'active', ${product.priceMinor}, ${literal(compare)}, NULL, ` +
          `${product.priceMinor}, ${product.priceMinor}, ${compare === null ? 0 : 1}, ` +
          `${product.featured ? 1 : 0}, ${product.sales ?? 0}, ${literal(product.createdAt)}, ${literal(product.createdAt)}`
        );
      }),
    ),
  );

  parts.push(
    insert(
      'product_translations',
      'product_id, locale, name, slug, short_description, description_md, seo_title, seo_description',
      vertical.products.flatMap((product) =>
        perLocale(product.name).map(
          ([locale, name]) =>
            `${literal(product.id)}, ${literal(locale)}, ${literal(name)}, ${literal(product.slug[locale])}, ` +
            `${literal(product.short[locale])}, ${literal(product.body[locale])}, '', ''`,
        ),
      ),
    ),
  );

  parts.push(
    insert(
      'product_categories',
      'product_id, category_id',
      vertical.products.map((product) => `${literal(product.id)}, ${literal(product.category)}`),
    ),
  );

  parts.push(
    insert(
      'product_variants',
      'id, product_id, sku, barcode, price_minor, compare_at_price_minor, cost_minor, stock, track_inventory, ' +
        'low_stock_threshold, image_media_id, position, is_active',
      vertical.products.flatMap((product) =>
        product.variants.map(
          (variant, index) =>
            `${literal(variant.id)}, ${literal(product.id)}, ${literal(variant.sku)}, NULL, NULL, NULL, ` +
            `${literal(variant.costMinor ?? null)}, ${variant.stock}, 1, NULL, NULL, ${index + 1}, 1`,
        ),
      ),
    ),
  );

  parts.push(
    insert(
      'variant_attribute_values',
      'variant_id, attribute_value_id',
      vertical.products.flatMap((product) =>
        product.variants.flatMap((variant) =>
          (variant.values ?? []).map((value) => `${literal(variant.id)}, ${literal(value)}`),
        ),
      ),
    ),
  );

  parts.push(
    insert(
      'product_search',
      'product_id, locale, name, short_description',
      vertical.products.flatMap((product) =>
        perLocale(product.name).map(
          ([locale, name]) =>
            `${literal(product.id)}, ${literal(locale)}, ${literal(name)}, ${literal(product.short[locale])}`,
        ),
      ),
    ),
  );

  parts.push(
    insert(
      'shipping_methods',
      'id, kind, name_json, description_json, price_minor, free_over_minor, is_active, position',
      shipping.map(
        (method, index) =>
          `${literal(method.id)}, ${literal(method.kind)}, ${jsonLiteral(method.name)}, ` +
          `${jsonLiteral(method.description)}, ${method.priceMinor}, ${literal(method.freeOverMinor)}, 1, ${index + 1}`,
      ),
    ),
  );

  // The ledger is derived, exactly as db/seed/dev.sql does it: every variant that starts with stock gets one movement,
  // so the inventory history matches the stock on hand from the first day.
  parts.push(
    'INSERT INTO inventory_movements (id, variant_id, product_id, delta, stock_after, reason, reference, note, actor, created_at)\n' +
      `SELECT 'mov-' || id, id, product_id, stock, stock, 'initial', NULL, NULL, 'system', ${literal(SEEDED_AT)}\n` +
      'FROM product_variants\nWHERE stock > 0;\n',
  );

  return parts.filter(Boolean).join('\n');
}
